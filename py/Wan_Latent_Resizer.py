"""
Wan Latent Resizer —— 提取自 LBH-123-AI/Comfyui-Wan-latent-Resizer (MIT)
Wan2.1 (16ch) 和 Wan2.2 (48ch) 专用潜空间智能缩放节点，支持放大与缩小。
模型权重需放置到 models/latent_upscale_models/ 目录。
"""
import os
import re
import glob

import torch
import torch.nn as nn
import torch.nn.functional as F
from einops import rearrange

import folder_paths


# ==========================================
# 注册模型文件夹（与 MiniMax H3 共享）
# ==========================================
_LATENT_UPSCALE_FOLDER = "latent_upscale_models"
if _LATENT_UPSCALE_FOLDER not in folder_paths.folder_names_and_paths:
    folder_paths.add_model_folder_path(
        _LATENT_UPSCALE_FOLDER,
        os.path.join(folder_paths.models_dir, _LATENT_UPSCALE_FOLDER)
    )


# ==========================================
# Wan 2.2 归一化参数 (48通道)
# ==========================================
WAN22_LATENTS_MEAN = [
    -0.2289, -0.0052, -0.1323, -0.2339, -0.2799, 0.0174, 0.1838, 0.1557,
    -0.1382, 0.0542, 0.2813, 0.0891, 0.157, -0.0098, 0.0375, -0.1825,
    -0.2246, -0.1207, -0.0698, 0.5109, 0.2665, -0.2108, -0.2158, 0.2502,
    -0.2055, -0.0322, 0.1109, 0.1567, -0.0729, 0.0899, -0.2799, -0.123,
    -0.0313, -0.1649, 0.0117, 0.0723, -0.2839, -0.2083, -0.052, 0.3748,
    0.0152, 0.1957, 0.1433, -0.2944, 0.3573, -0.0548, -0.1681, -0.0667,
]
WAN22_LATENTS_STD = [
    0.4765, 1.0364, 0.4514, 1.1677, 0.5313, 0.499, 0.4818, 0.5013,
    0.8158, 1.0344, 0.5894, 1.0901, 0.6885, 0.6165, 0.8454, 0.4978,
    0.5759, 0.3523, 0.7135, 0.6804, 0.5833, 1.4146, 0.8986, 0.5659,
    0.7069, 0.5338, 0.4889, 0.4917, 0.4069, 0.4999, 0.6866, 0.4093,
    0.5709, 0.6065, 0.6415, 0.4944, 0.5726, 1.2042, 0.5458, 1.6887,
    0.3971, 1.06, 0.3943, 0.5537, 0.5444, 0.4089, 0.7468, 0.7744,
]


def _make_wan22_norm_tensors(device, dtype):
    mean = torch.tensor(WAN22_LATENTS_MEAN, dtype=dtype, device=device).view(1, -1, 1, 1, 1)
    std = torch.tensor(WAN22_LATENTS_STD, dtype=dtype, device=device).view(1, -1, 1, 1, 1)
    return mean, std


# ==========================================
# 通用模型定义 (2D逐帧 + Video包装)
# ==========================================
def normalization(channels):
    return nn.GroupNorm(32, channels)


def zero_module(module):
    for p in module.parameters():
        p.detach().zero_()
    return module


class WanAttnBlock(nn.Module):
    def __init__(self, in_channels):
        super().__init__()
        self.norm = normalization(in_channels)
        self.q = nn.Conv2d(in_channels, in_channels, 1)
        self.k = nn.Conv2d(in_channels, in_channels, 1)
        self.v = nn.Conv2d(in_channels, in_channels, 1)
        self.proj_out = nn.Conv2d(in_channels, in_channels, 1)

    def forward(self, x):
        h = self.norm(x)
        q = rearrange(self.q(h), "b c h w -> b 1 (h w) c")
        k = rearrange(self.k(h), "b c h w -> b 1 (h w) c")
        v = rearrange(self.v(h), "b c h w -> b 1 (h w) c")
        h = F.scaled_dot_product_attention(q, k, v)
        h = rearrange(h, "b 1 (h w) c -> b c h w", h=x.shape[-2], w=x.shape[-1])
        return x + self.proj_out(h)


class WanResBlockEmb(nn.Module):
    def __init__(self, channels, emb_channels, dropout=0, out_channels=None):
        super().__init__()
        oc = out_channels or channels
        self.in_layers = nn.Sequential(
            normalization(channels), nn.SiLU(), nn.Conv2d(channels, oc, 3, 1, 1))
        self.emb_layers = nn.Sequential(nn.SiLU(), nn.Linear(emb_channels, 2 * oc))
        self.out_norm = normalization(oc)
        self.out_layers = nn.Sequential(
            nn.SiLU(), nn.Dropout(dropout), zero_module(nn.Conv2d(oc, oc, 3, 1, 1)))
        self.skip = nn.Conv2d(channels, oc, 1) if oc != channels else nn.Identity()

    def forward(self, x, emb):
        h = self.in_layers(x)
        emb_out = self.emb_layers(emb).type(h.dtype)
        while len(emb_out.shape) < len(h.shape):
            emb_out = emb_out[..., None]
        sc, sh = torch.chunk(emb_out, 2, 1)
        h = self.out_norm(h) * (1 + sc) + sh
        return self.skip(x) + self.out_layers(h)


class WanLatentResizer(nn.Module):
    def __init__(self, in_channels=16, in_blocks=8, out_blocks=8,
                 channels=192, dropout=0.1, attn=False, embed_dim=32):
        super().__init__()
        self.conv_in = nn.Conv2d(in_channels, channels, 3, 1, 1)
        self.embed = nn.Sequential(
            nn.Linear(1, embed_dim), nn.SiLU(), nn.Linear(embed_dim, embed_dim))
        self.in_blocks = nn.ModuleList()
        for i in range(in_blocks):
            if attn and (i == 1 or i == in_blocks - 1):
                self.in_blocks.append(WanAttnBlock(channels))
            self.in_blocks.append(WanResBlockEmb(channels, embed_dim, dropout))
        self.out_blocks = nn.ModuleList()
        for i in range(out_blocks):
            if attn and (i == 1 or i == out_blocks - 1):
                self.out_blocks.append(WanAttnBlock(channels))
            self.out_blocks.append(WanResBlockEmb(channels, embed_dim, dropout))
        self.norm_out = normalization(channels)
        self.conv_out = nn.Conv2d(channels, in_channels, 3, 1, 1)

    def forward(self, x, scale=None, target_hw=None):
        if target_hw is not None:
            size = target_hw
        elif scale is not None:
            size = tuple(int(round(s * scale)) for s in x.shape[-2:])
        else:
            return x
        if size == x.shape[-2:]:
            return x
        emb_val = (scale - 1) if (scale is not None and target_hw is None) else 0.0
        emb = self.embed(torch.tensor([emb_val], dtype=x.dtype, device=x.device).unsqueeze(0))
        x = self.conv_in(x)
        for b in self.in_blocks:
            x = b(x, emb) if isinstance(b, WanResBlockEmb) else b(x)
        x = F.interpolate(x, size=size, mode="bilinear")
        for b in self.out_blocks:
            x = b(x, emb) if isinstance(b, WanResBlockEmb) else b(x)
        return self.conv_out(F.silu(self.norm_out(x)))


class WanVideoLatentResizer(nn.Module):
    def __init__(self, **kwargs):
        super().__init__()
        self.resizer = WanLatentResizer(**kwargs)

    def forward(self, x, scale=None, target_hw=None):
        B, C, T, H, W = x.shape
        x = rearrange(x, "b c t h w -> (b t) c h w")
        x = self.resizer(x, scale=scale, target_hw=target_hw)
        return rearrange(x, "(b t) c h w -> b c t h w", b=B, t=T)


# ==========================================
# 模型扫描与加载
# ==========================================
_MODEL_CACHE = {}


def _get_models_dir():
    return folder_paths.get_folder_paths(_LATENT_UPSCALE_FOLDER)[0]


def scan_wan_models():
    names = [
        name for name in folder_paths.get_filename_list(_LATENT_UPSCALE_FOLDER)
        if os.path.splitext(name)[1].lower() in (".pth", ".safetensors", ".pt")
    ]
    return sorted(names) if names else [f"(place models in: {_get_models_dir()})"]


def _load_raw_sd(path):
    if path.endswith('.safetensors'):
        from safetensors.torch import load_file
        sd = load_file(path, device='cpu')
    else:
        sd = torch.load(path, map_location='cpu', weights_only=False)
    if isinstance(sd, dict) and 'model' in sd:
        sd = sd['model']
    sd = {k: v.to(torch.float16) if v.dtype == torch.float8_e4m3fn else v
          for k, v in sd.items()}
    return sd


def _split_merged(sd):
    """分离合并模型中的 upscaler 和 downscaler 权重"""
    if not any(k.startswith("upscaler.") for k in sd):
        return sd, None
    up, down = {}, {}
    for k, v in sd.items():
        if k.startswith("upscaler."):
            up[k[len("upscaler."):]] = v
        elif k.startswith("downscaler."):
            down[k[len("downscaler."):]] = v
    return up, down


def _detect_arch_generic(sd, default_in_ch, default_ch, default_embed, default_attn):
    """通用架构检测，返回模型构造参数"""
    cfg = {
        "in_channels": default_in_ch, "in_blocks": 8, "out_blocks": 8,
        "channels": default_ch, "dropout": 0.1, "attn": default_attn,
        "embed_dim": default_embed,
    }
    conv_key = 'resizer.conv_in.weight'
    if conv_key in sd:
        cfg["in_channels"] = sd[conv_key].shape[1]
        cfg["channels"] = sd[conv_key].shape[0]
    embed_key = 'resizer.embed.0.weight'
    if embed_key in sd:
        cfg["embed_dim"] = sd[embed_key].shape[0]
    in_res, out_res = set(), set()
    for k in sd:
        m = re.match(r'resizer\.in_blocks\.(\d+)\.in_layers\.', k)
        if m: in_res.add(int(m.group(1)))
        m = re.match(r'resizer\.out_blocks\.(\d+)\.in_layers\.', k)
        if m: out_res.add(int(m.group(1)))
    if in_res: cfg["in_blocks"] = len(in_res)
    if out_res: cfg["out_blocks"] = len(out_res)
    cfg["attn"] = any('.q.' in k for k in sd)
    return cfg


def load_wan_model(name, mode, device, version):
    """version: '2.1' or '2.2'"""
    cache_key = f"{name}::{mode}::{version}"
    if cache_key in _MODEL_CACHE:
        return _MODEL_CACHE[cache_key]
    try:
        path = folder_paths.get_full_path_or_raise(_LATENT_UPSCALE_FOLDER, name)
    except Exception:
        path = os.path.join(_get_models_dir(), name)
    raw_sd = _load_raw_sd(path)
    up_sd, down_sd = _split_merged(raw_sd)
    model_sd = down_sd if (mode == "downscale" and down_sd) else up_sd

    if version == "2.2":
        cfg = _detect_arch_generic(model_sd, 48, 256, 64, True)
    else:
        cfg = _detect_arch_generic(model_sd, 16, 192, 32, False)

    model = WanVideoLatentResizer(**cfg)
    missing, unexpected = model.load_state_dict(model_sd, strict=False)
    if missing:
        print(f"[Wan{version} Resizer] missing keys: {missing[:3]}...")
    if unexpected:
        print(f"[Wan{version} Resizer] unexpected keys: {unexpected[:3]}...")
    model = model.to(device).eval()
    _MODEL_CACHE[cache_key] = model
    print(f"[Wan{version} Resizer] Loaded: {name} (mode={mode})")
    print(f"  Params: {sum(p.numel() for p in model.parameters()):,} | "
          f"in_ch={cfg['in_channels']} channels={cfg['channels']} "
          f"blocks={cfg['in_blocks']}+{cfg['out_blocks']} attn={cfg['attn']}")
    return model


# ==========================================
# Wan 2.1 节点 (16通道，无归一化)
# ==========================================
class wcx_Wan21LatentResizer:
    """Wan 2.1 Latent 智能缩放。scale>1 放大，scale<1 缩小，scale=1 直通。"""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "latent": ("LATENT",),
                "model_name": (scan_wan_models(),),
                "scale": ("FLOAT", {"default": 2.5, "min": 0.1, "max": 10.0, "step": 0.1}),
                "device": (["cuda", "cpu"], {"default": "cuda"}),
                "use_fp16": ("BOOLEAN", {"default": False}),
            }
        }

    RETURN_TYPES = ("LATENT",)
    FUNCTION = "run"
    CATEGORY = "Practical-Tools/Latent"

    def run(self, latent, model_name, scale, device, use_fp16):
        if model_name.startswith('('):
            raise ValueError("请将模型文件放入 latent_upscale_models 目录")
        if abs(scale - 1.0) < 1e-6:
            return (latent,)
        mode = "upscale" if scale > 1.0 else "downscale"
        dev = torch.device(device if torch.cuda.is_available() else "cpu")
        model = load_wan_model(model_name, mode, dev, "2.1")
        s = latent["samples"].clone()
        orig_dtype, orig_shape = s.dtype, s.shape
        if len(s.shape) == 4:
            s = s.unsqueeze(2)
        compute_dtype = torch.float16 if use_fp16 else torch.float32
        s = s.to(dev, compute_dtype)
        model = model.to(compute_dtype)
        with torch.no_grad():
            if mode == "upscale":
                out = model(s, scale=scale)
            else:
                B, C, T, H, W = s.shape
                th = max(1, int(round(H * scale)))
                tw = max(1, int(round(W * scale)))
                out = model(s, target_hw=(th, tw))
        if len(orig_shape) == 4:
            out = out.squeeze(2)
        out = out.cpu().to(orig_dtype)
        if dev.type == "cuda":
            torch.cuda.empty_cache()
        return ({"samples": out},)


# ==========================================
# Wan 2.2 节点 (48通道，有归一化)
# ==========================================
class wcx_Wan22LatentResizer:
    """Wan 2.2 Latent 智能缩放。scale>1 放大，scale<1 缩小，scale=1 直通。"""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "latent": ("LATENT",),
                "model_name": (scan_wan_models(),),
                "scale": ("FLOAT", {"default": 2.0, "min": 0.1, "max": 10.0, "step": 0.1}),
                "device": (["cuda", "cpu"], {"default": "cuda"}),
                "use_fp16": ("BOOLEAN", {"default": False}),
            }
        }

    RETURN_TYPES = ("LATENT",)
    FUNCTION = "run"
    CATEGORY = "Practical-Tools/Latent"

    def run(self, latent, model_name, scale, device, use_fp16):
        if model_name.startswith('('):
            raise ValueError("请将模型文件放入 latent_upscale_models 目录")
        if abs(scale - 1.0) < 1e-6:
            return (latent,)
        mode = "upscale" if scale > 1.0 else "downscale"
        dev = torch.device(device if torch.cuda.is_available() else "cpu")
        model = load_wan_model(model_name, mode, dev, "2.2")
        s = latent["samples"].clone()
        orig_dtype, orig_shape = s.dtype, s.shape
        if len(s.shape) == 4:
            s = s.unsqueeze(2)
        compute_dtype = torch.float16 if use_fp16 else torch.float32
        s = s.to(dev, compute_dtype)
        model = model.to(compute_dtype)
        # 归一化
        norm_mean, norm_std = _make_wan22_norm_tensors(dev, compute_dtype)
        s = (s - norm_mean) / norm_std
        with torch.no_grad():
            if mode == "upscale":
                out = model(s, scale=scale)
            else:
                B, C, T, H, W = s.shape
                th = max(1, int(round(H * scale)))
                tw = max(1, int(round(W * scale)))
                out = model(s, target_hw=(th, tw))
        # 反归一化
        out = out * norm_std + norm_mean
        if len(orig_shape) == 4:
            out = out.squeeze(2)
        out = out.cpu().to(orig_dtype)
        if dev.type == "cuda":
            torch.cuda.empty_cache()
        return ({"samples": out},)


# ==========================================
# 节点注册
# ==========================================
NODE_CLASS_MAPPINGS = {
    "wcx_Wan21LatentResizer": wcx_Wan21LatentResizer,
    "wcx_Wan22LatentResizer": wcx_Wan22LatentResizer,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_Wan21LatentResizer": "Wan 2.1 Latent Resizer",
    "wcx_Wan22LatentResizer": "Wan 2.2 Latent Resizer",
}
