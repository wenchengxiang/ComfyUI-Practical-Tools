"""
wcx_GeneralLatentUpscaler (显示名: General Latent Upscaler) —— 提取自 LoganBooker/SesquiLSR (MIT)
Latent 空间任意倍率上采样（1.0x–2.0x），支持 SDXL / Flux / Flux2 / Ideogram4 / Wan2.1。

权重放在 ComfyUI/models/latent_upscale_models/ 下，文件名自由命名，
但文件名里必须包含以下关键字之一来告诉节点用哪种 adaptor：
  sdxl     -> SDXL (4ch, affine)
  ideogram -> Ideogram 4 (32ch, shift/scale patchify)
  flux2    -> Flux2 (32ch, BN patchify)
  flux     -> Flux / Z-Image / Lumina (16ch, affine)
  wan / qwen / krea / anima -> Wan2.1 系 (16ch, identity)
核心库在 py/sesqui_lsr/。
"""
from __future__ import annotations

import os
from pathlib import Path

import torch

import folder_paths

from sesqui_lsr import LatentUpscaler, make_flux, make_flux2, make_identity, make_ideogram4, make_sdxl
from sesqui_lsr.inference_adaptors import LatentFormatAdaptor

# 权重目录：ComfyUI/models/latent_upscale_models/
_LATENT_UPSCALE_FOLDER = "latent_upscale_models"
if _LATENT_UPSCALE_FOLDER not in folder_paths.folder_names_and_paths:
    folder_paths.add_model_folder_path(
        _LATENT_UPSCALE_FOLDER,
        os.path.join(folder_paths.models_dir, _LATENT_UPSCALE_FOLDER),
    )


# ── 文件名关键字 → adaptor / in_channels ────────────────────────────────
# 按顺序匹配（长关键字优先，避免 flux2 被 flux 抢先命中）

_RULES = [
    ("ideogram", {"in_channels": 32, "adaptor_fn": lambda: make_ideogram4()}),
    ("flux2",    {"in_channels": 32, "adaptor_fn": lambda: make_flux2()}),
    ("sdxl",     {"in_channels": 4,  "adaptor_fn": lambda: make_sdxl()}),
    ("flux",     {"in_channels": 16, "adaptor_fn": lambda: make_flux()}),
    ("wan",      {"in_channels": 16, "adaptor_fn": lambda: make_identity(16)}),
    ("qwen",     {"in_channels": 16, "adaptor_fn": lambda: make_identity(16)}),
    ("krea",     {"in_channels": 16, "adaptor_fn": lambda: make_identity(16)}),
    ("anima",    {"in_channels": 16, "adaptor_fn": lambda: make_identity(16)}),
]


def _detect_format(filename: str) -> dict:
    """根据文件名小写匹配 adaptor 规则。"""
    name = filename.lower()
    for key, cfg in _RULES:
        if key in name:
            return cfg
    raise ValueError(
        f"无法从文件名 '{filename}' 识别 latent 格式。\n"
        f"文件名需包含以下关键字之一: sdxl / flux2 / ideogram / flux / wan / qwen / krea / anima"
    )


def _list_weight_files() -> list:
    out = []
    for d in folder_paths.get_folder_paths(_LATENT_UPSCALE_FOLDER):
        p = Path(d)
        if not p.is_dir():
            continue
        for f in sorted(p.iterdir()):
            if f.is_file() and f.suffix.lower() == ".safetensors":
                # 只列文件名含 latent 格式关键字的，避免和 ltx/minimax_h3 等完全无关的权重混在一起
                name_low = f.name.lower()
                if any(k in name_low for k in ("sdxl", "flux2", "ideogram", "flux", "wan", "qwen", "krea", "anima")):
                    out.append(f.name)
    seen = set()
    uniq = []
    for n in out:
        if n not in seen:
            seen.add(n)
            uniq.append(n)
    return uniq


# ── Helpers ──────────────────────────────────────────────────────────────


def _resolve_dtype(half_precision: bool, device: torch.device) -> torch.dtype:
    if not half_precision or device.type != "cuda":
        return torch.float32
    return torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16


def _format_channel_hint(channels: int) -> str:
    mapping = {4: "SDXL", 16: "Flux or Wan 2.1", 32: "Flux2 VAE space", 128: "Flux2 packed"}
    return mapping.get(channels, f"{channels}-channel")


def _flatten_to_4d(z: torch.Tensor, expected_channels: int):
    if z.ndim == 4:
        return z, ("4d",)
    if z.ndim != 5:
        raise ValueError(f"Unsupported latent rank {z.ndim}; expected 4D or 5D tensor")
    if z.shape[1] == expected_channels:
        b, c, t, h, w = z.shape
        return z.permute(0, 2, 1, 3, 4).reshape(b * t, c, h, w), ("bcthw", (b, c, t))
    if z.shape[2] == expected_channels:
        b, t, c, h, w = z.shape
        return z.reshape(b * t, c, h, w), ("btchw", (b, t, c))
    raise ValueError(
        f"Could not find {expected_channels}-channel axis "
        f"({_format_channel_hint(expected_channels)}) in latent shape {tuple(z.shape)}"
    )


def _restore_from_4d(z4: torch.Tensor, layout) -> torch.Tensor:
    kind = layout[0]
    if kind == "4d":
        return z4
    if kind == "bcthw":
        b, c, t = layout[1]
        return z4.reshape(b, t, c, *z4.shape[-2:]).permute(0, 2, 1, 3, 4)
    if kind == "btchw":
        b, t, c = layout[1]
        return z4.reshape(b, t, c, *z4.shape[-2:])
    raise ValueError(f"Unknown latent layout {kind!r}")


def _resize_mask(mask: torch.Tensor, target_hw) -> torch.Tensor:
    if mask.shape[-2:] == target_hw:
        return mask
    flat = mask.reshape(-1, 1, *mask.shape[-2:]).float()
    flat = torch.nn.functional.interpolate(flat, size=target_hw, mode="nearest")
    return flat.reshape(*mask.shape[:-2], *target_hw).to(mask.dtype)


def _find_model(filename: str) -> Path:
    for d in folder_paths.get_folder_paths(_LATENT_UPSCALE_FOLDER):
        p = Path(d) / filename
        if p.is_file():
            return p
    raise FileNotFoundError(
        f"权重文件 '{filename}' 未在 {folder_paths.get_folder_paths(_LATENT_UPSCALE_FOLDER)} 中找到"
    )


# 单活动模型缓存：key = (filename, dtype)
_active_key = None
_active_model = None
_active_adaptor = None


def _load_model(filename: str, dtype: torch.dtype):
    """根据文件名识别格式并加载模型 + adaptor。"""
    global _active_key, _active_model, _active_adaptor

    key = (filename, dtype)
    if _active_key != key or _active_model is None:
        cfg = _detect_format(filename)
        path = _find_model(filename)

        from safetensors.torch import load_file

        state_dict = load_file(str(path))
        model = LatentUpscaler(in_channels=cfg["in_channels"])
        model.load_state_dict(state_dict)
        model.to(dtype=dtype).eval().requires_grad_(False)

        _active_model = model
        _active_adaptor = cfg["adaptor_fn"]()
        _active_key = key

    return _active_model, _active_adaptor


# ── ComfyUI node ─────────────────────────────────────────────────────────


class wcx_GeneralLatentUpscaler:
    """从 latent_upscale_models/ 选权重文件，任意 1.0x–2.0x 上采样。"""

    @classmethod
    def INPUT_TYPES(cls):
        weight_files = _list_weight_files()
        default_model = weight_files[0] if weight_files else ""
        return {
            "required": {
                "latent": ("LATENT",),
                "model": (
                    weight_files if weight_files else (["<未找到权重文件>"],),
                    {
                        "default": default_model,
                        "tooltip": (
                            "从 models/latent_upscale_models/ 选择 .safetensors 权重（只列 upscaler_ 开头的文件）。\n"
                            "文件名需包含对应关键字来识别 latent 格式：\n"
                            "  sdxl     -> SDXL (not compatible with SD 1.5)\n"
                            "  flux     -> Flux (Flux, Z-Image Turbo, Lumina, ...)\n"
                            "  flux2    -> Flux2 (Flux2, Flux2 Klein: BN-packed latent, ...)\n"
                            "  ideogram -> Ideogram 4 (Flux2: shift/scale-packed latent, ...)\n"
                            "  wan/qwen/krea/anima -> Wan 2.1 (Wan 2.x, Krea 2, Anima, Qwen Image, ...)"
                        ),
                    },
                ),
                "scale": (
                    "FLOAT",
                    {"default": 1.5, "min": 1.0, "max": 2.0, "step": 0.05},
                ),
                "half_precision": (
                    "BOOLEAN",
                    {"default": True},
                ),
            },
        }

    RETURN_TYPES = ("LATENT",)
    FUNCTION = "upscale"
    CATEGORY = "Practical-Tools/Latent"
    OUTPUT_NODE = False

    def upscale(
        self,
        latent: dict,
        model: str,
        scale: float,
        half_precision: bool,
    ):
        try:
            if not model or model.startswith("<未找到"):
                raise FileNotFoundError(
                    "请先把 SesquiLSR 权重放到 ComfyUI/models/latent_upscale_models/ 下"
                )

            device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            dtype = _resolve_dtype(half_precision, device)
            net, adaptor = _load_model(model, dtype)

            samples = latent["samples"]
            if samples.ndim not in (4, 5):
                raise ValueError(f"Expected 4D/5D latent, got {tuple(samples.shape)}")

            h, w = samples.shape[-2:]
            target_h, target_w = round(h * scale), round(w * scale)

            ext_ch = adaptor.external_channels
            samples_4d, layout = _flatten_to_4d(samples, ext_ch)
            samples_fp32 = samples_4d.to(device=device, dtype=torch.float32)

            z_fp32 = adaptor.to_vae_latent(samples_fp32)
            vae_target = adaptor.vae_target_size((target_h, target_w))

            z = z_fp32.to(dtype=dtype)
            net.to(device=device)
            with torch.no_grad():
                z_up = net(z, vae_target)

            result_4d = adaptor.from_vae_latent(z_up.float()).to(
                device=samples.device, dtype=samples.dtype,
            )
            result = _restore_from_4d(result_4d, layout)

            out = {"samples": result}
            if "noise_mask" in latent:
                out["noise_mask"] = _resize_mask(latent["noise_mask"], result.shape[-2:])
            return (out,)

        except Exception as e:
            raise ValueError(
                f"General Latent Upscaler [{model}]: {e}"
            ) from e


# ── Registration ─────────────────────────────────────────────────────────

NODE_CLASS_MAPPINGS = {
    "wcx_GeneralLatentUpscaler": wcx_GeneralLatentUpscaler,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_GeneralLatentUpscaler": "General Latent Upscaler",
}
