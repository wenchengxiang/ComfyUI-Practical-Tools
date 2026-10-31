"""
Minimax H3 Latent Upscaler —— 提取自 LBH-123-AI/Comfyui_Minimax_h3_latent_Upscaler (MIT)
包含 2D 和 3D 两个潜空间放大节点，专为 MiniMax H3 24通道 latent 设计。
模型权重需放置到 models/latent_upscale_models/ 目录。
"""
import os
import re
import gc
import glob

import torch
import torch.nn as nn
import torch.nn.functional as F
from einops import rearrange

import folder_paths

try:
    import comfy.model_management as mm
    HAS_COMFY_MM = True
except ImportError:
    HAS_COMFY_MM = False


# ==========================================
# 注册模型文件夹
# ==========================================
_LATENT_UPSCALE_FOLDER = "latent_upscale_models"
if _LATENT_UPSCALE_FOLDER not in folder_paths.folder_names_and_paths:
    folder_paths.add_model_folder_path(
        _LATENT_UPSCALE_FOLDER,
        os.path.join(folder_paths.models_dir, _LATENT_UPSCALE_FOLDER)
    )

VAE_DOWNSAMPLE = 16


# ==========================================
# Minimax H3 归一化参数 (24通道)
# ==========================================
LATENTS_MEAN = [
    0.858090341091156, -0.9606591463088989, 1.0661640167236328, -0.5090325474739075,
    -0.2727581858634949, -1.3675414323806763, -0.2553254961967468, -0.26907554268836975,
    -0.5376840829849243, -0.0464097298681736, 0.6657370328903198, 0.19690127670764923,
    -0.5460608005523682, -0.4035342037677765, -0.23683024942874908, 0.25928452610969543,
    -0.30133944749832153, 0.211341992020607, -1.1206848621368408, 0.3581933379173279,
    -0.04225143790245056, 0.2604829967021942, 0.22864092886447906, 0.7056031823158264
]
LATENTS_STD = [
    1.2223774194717407, 1.2767263650894165, 1.6831774711608887, 1.7549455165863037,
    1.5636216402053833, 2.194143533706665, 0.9653137922286987, 1.0569885969161987,
    0.841948926448822, 0.7729952931404114, 1.8955937623977661, 0.946841835975647,
    0.7996809482574463, 0.44988900423049927, 0.7197399735450745, 0.6936293244361877,
    2.961095094680786, 2.7694199085235596, 3.0496184825897217, 2.1088054180145264,
    3.276226282119751, 3.1627357006073, 2.2816812992095947, 2.6127843856811523
]


def _make_norm_tensors(device, dtype):
    mean = torch.tensor(LATENTS_MEAN, dtype=dtype, device=device).view(1, -1, 1, 1, 1)
    std = torch.tensor(LATENTS_STD, dtype=dtype, device=device).view(1, -1, 1, 1, 1)
    return mean, std


# ==========================================
# 通用工具函数
# ==========================================
def normalization(channels):
    return nn.GroupNorm(32, channels)


def zero_module(module):
    for p in module.parameters():
        p.detach().zero_()
    return module


def _is_rocm_build():
    return getattr(torch.version, "hip", None) is not None


def _resolve_device(backend):
    if backend == "cpu":
        return torch.device("cpu")
    if backend == "rocm":
        if not _is_rocm_build():
            raise RuntimeError("ROCm was selected, but this PyTorch build has no HIP/ROCm support.")
        if not torch.cuda.is_available():
            raise RuntimeError("ROCm was selected, but PyTorch cannot access an AMD GPU.")
        return torch.device("cuda")
    if backend == "cuda":
        return torch.device("cuda" if torch.cuda.is_available() else "cpu")
    raise ValueError(f"Unsupported device backend: {backend}")


def _backend_label(device):
    if device.type == "cuda" and _is_rocm_build():
        return f"ROCm/HIP {torch.version.hip}"
    if device.type == "cuda":
        return f"CUDA {getattr(torch.version, 'cuda', None) or 'unknown'}"
    return "CPU"


def get_models_dir():
    return folder_paths.get_folder_paths(_LATENT_UPSCALE_FOLDER)[0]


def scan_models():
    names = [
        name for name in folder_paths.get_filename_list(_LATENT_UPSCALE_FOLDER)
        if os.path.splitext(name)[1].lower() in (".pth", ".safetensors")
    ]
    return names if names else [f"(place models in: {get_models_dir()})"]


def _load_raw_sd(path):
    if path.endswith('.safetensors'):
        try:
            from safetensors import safe_open
            with safe_open(path, framework="pt", device="cpu") as f:
                sd = {k: f.get_tensor(k) for k in f.keys()}
        except ImportError:
            from safetensors.torch import load_file
            sd = load_file(path, device='cpu')
    else:
        sd = torch.load(path, map_location='cpu', weights_only=False)
    if isinstance(sd, dict) and 'model' in sd:
        sd = sd['model']
    sd = {k: v.to(torch.float16) if v.dtype == torch.float8_e4m3fn else v
          for k, v in sd.items()}
    return sd


def _extract_upscaler_sd(sd):
    if any(k.startswith("upscaler.") for k in sd):
        return {k[len("upscaler."):]: v for k, v in sd.items() if k.startswith("upscaler.")}
    return sd


# ==========================================
# 2D 模型定义 (2D主干 + Temporal)
# ==========================================
class AttnBlock2D(nn.Module):
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


class ResBlockEmb2D(nn.Module):
    def __init__(self, channels, emb_channels, dropout=0, out_channels=None):
        super().__init__()
        self.out_channels = out_channels or channels
        self.in_layers = nn.Sequential(
            normalization(channels), nn.SiLU(),
            nn.Conv2d(channels, self.out_channels, 3, padding=1),
        )
        self.emb_layers = nn.Sequential(
            nn.SiLU(), nn.Linear(emb_channels, 2 * self.out_channels),
        )
        self.out_norm = normalization(self.out_channels)
        self.out_layers = nn.Sequential(
            nn.SiLU(), nn.Dropout(p=dropout),
            zero_module(nn.Conv2d(self.out_channels, self.out_channels, 3, padding=1)),
        )
        self.skip = (
            nn.Conv2d(channels, self.out_channels, 1)
            if self.out_channels != channels else nn.Identity()
        )

    def forward(self, x, emb):
        h = self.in_layers(x)
        emb_out = self.emb_layers(emb).type(h.dtype)
        while len(emb_out.shape) < len(h.shape):
            emb_out = emb_out[..., None]
        scale, shift = torch.chunk(emb_out, 2, dim=1)
        h = self.out_norm(h) * (1 + scale) + shift
        h = self.out_layers(h)
        return self.skip(x) + h


class TemporalConv2D(nn.Module):
    def __init__(self, channels, kernel_size=5):
        super().__init__()
        padding = kernel_size // 2
        self.norm = normalization(channels)
        self.dwconv = nn.Conv3d(channels, channels,
                                kernel_size=(kernel_size, 1, 1),
                                padding=(padding, 0, 0),
                                groups=channels)
        self.pwconv = nn.Conv3d(channels, channels, kernel_size=1)
        nn.init.zeros_(self.pwconv.weight)
        nn.init.zeros_(self.pwconv.bias)

    def forward(self, x):
        identity = x
        B, C, T, H, W = x.shape
        h = rearrange(x, "b c t h w -> (b t) c h w")
        h = self.norm(h)
        h = rearrange(h, "(b t) c h w -> b c t h w", b=B, t=T)
        h = F.silu(h)
        h = self.dwconv(h)
        h = self.pwconv(h)
        return identity + h


class LatentResizer2D(nn.Module):
    """2D 主干 (与训练代码完全一致)"""
    def __init__(self, in_channels=24, in_blocks=12, out_blocks=12,
                 channels=640, dropout=0.1, attn=False):
        super().__init__()
        self.conv_in = nn.Conv2d(in_channels, channels, 3, padding=1)
        embed_dim = 64
        self.embed = nn.Sequential(
            nn.Linear(1, embed_dim), nn.SiLU(), nn.Linear(embed_dim, embed_dim))
        self.in_blocks = nn.ModuleList()
        for b in range(in_blocks):
            if (b == 1 or b == in_blocks - 1) and attn:
                self.in_blocks.append(AttnBlock2D(channels))
            self.in_blocks.append(ResBlockEmb2D(channels, embed_dim, dropout))
        self.out_blocks = nn.ModuleList()
        for b in range(out_blocks):
            if (b == 1 or b == out_blocks - 1) and attn:
                self.out_blocks.append(AttnBlock2D(channels))
            self.out_blocks.append(ResBlockEmb2D(channels, embed_dim, dropout))
        self.norm_out = normalization(channels)
        self.conv_out = nn.Conv2d(channels, in_channels, 3, padding=1)

    def forward(self, x, scale=None, target_hw=None):
        if target_hw is not None:
            size = target_hw
        elif scale is not None:
            size = tuple(int(round(s * scale)) for s in x.shape[-2:])
        else:
            return x
        if size == x.shape[-2:]:
            return x
        scale_emb = torch.tensor(
            [scale - 1 if scale is not None else 0.0],
            dtype=x.dtype, device=x.device).unsqueeze(0)
        emb = self.embed(scale_emb)
        x = self.conv_in(x)
        for b in self.in_blocks:
            if isinstance(b, ResBlockEmb2D):
                x = b(x, emb)
            else:
                x = b(x)
        x = F.interpolate(x, size=size, mode="bilinear")
        for b in self.out_blocks:
            if isinstance(b, ResBlockEmb2D):
                x = b(x, emb)
            else:
                x = b(x)
        x = self.norm_out(x)
        x = F.silu(x)
        x = self.conv_out(x)
        return x


class VideoLatentResizer(nn.Module):
    """5D 包装器 (含 Temporal 块) 与训练代码完全一致"""
    def __init__(self, in_channels=24, in_blocks=12, out_blocks=12,
                 channels=640, dropout=0.1, attn=False,
                 temporal_every=2, temporal_kernel=5):
        super().__init__()
        self.resizer = LatentResizer2D(
            in_channels=in_channels, in_blocks=in_blocks,
            out_blocks=out_blocks, channels=channels,
            dropout=dropout, attn=attn,
        )
        self.temporal_blocks = nn.ModuleList()
        if temporal_every > 0:
            self.temporal_blocks.append(TemporalConv2D(channels, temporal_kernel))
            self.temporal_blocks.append(TemporalConv2D(channels, temporal_kernel))
        self.temporal_every = temporal_every
        self.temporal_kernel = temporal_kernel

    def forward(self, x, scale=None, target_hw=None):
        B, C, T, H, W = x.shape
        if target_hw is not None:
            size = target_hw
        elif scale is not None:
            size = (int(round(H * scale)), int(round(W * scale)))
        else:
            size = (H, W)
        if len(self.temporal_blocks) == 0:
            x_flat = rearrange(x, "b c t h w -> (b t) c h w")
            out = self.resizer(x_flat, scale=scale, target_hw=size)
            return rearrange(out, "(b t) c h w -> b c t h w", b=B, t=T)
        x_flat = rearrange(x, "b c t h w -> (b t) c h w")
        emb = torch.tensor(
            [scale - 1 if scale is not None else 0.0],
            dtype=x.dtype, device=x.device).unsqueeze(0)
        emb = self.resizer.embed(emb)
        out = self.resizer.conv_in(x_flat)
        for i, block in enumerate(self.resizer.in_blocks):
            if isinstance(block, ResBlockEmb2D):
                emb_t = emb.expand(B * T, -1)
                out = block(out, emb_t)
            else:
                out = block(out)
            if i % self.temporal_every == 0:
                out_3d = rearrange(out, "(b t) c h w -> b c t h w", b=B, t=T)
                out_3d = self.temporal_blocks[0](out_3d)
                out = rearrange(out_3d, "b c t h w -> (b t) c h w")
        out = F.interpolate(out, size=size, mode="bilinear")
        for i, block in enumerate(self.resizer.out_blocks):
            if isinstance(block, ResBlockEmb2D):
                emb_t = emb.expand(B * T, -1)
                out = block(out, emb_t)
            else:
                out = block(out)
            if i % self.temporal_every == 0:
                out_3d = rearrange(out, "(b t) c h w -> b c t h w", b=B, t=T)
                out_3d = self.temporal_blocks[1](out_3d)
                out = rearrange(out_3d, "b c t h w -> (b t) c h w")
        out = self.resizer.norm_out(out)
        out = F.silu(out)
        out = self.resizer.conv_out(out)
        out = rearrange(out, "(b t) c h w -> b c t h w", b=B, t=T)
        return out


# ==========================================
# 3D 模型定义 (纯3D卷积 + Temporal Chunking)
# ==========================================
class AttnBlock3D(nn.Module):
    def __init__(self, in_channels):
        super().__init__()
        self.norm = normalization(in_channels)
        self.q = nn.Conv3d(in_channels, in_channels, 1)
        self.k = nn.Conv3d(in_channels, in_channels, 1)
        self.v = nn.Conv3d(in_channels, in_channels, 1)
        self.proj_out = nn.Conv3d(in_channels, in_channels, 1)

    def forward(self, x):
        h = self.norm(x)
        q = rearrange(self.q(h), "b c t h w -> b 1 (t h w) c")
        k = rearrange(self.k(h), "b c t h w -> b 1 (t h w) c")
        v = rearrange(self.v(h), "b c t h w -> b 1 (t h w) c")
        h = F.scaled_dot_product_attention(q, k, v)
        h = rearrange(h, "b 1 (t h w) c -> b c t h w", t=x.shape[2], h=x.shape[3], w=x.shape[4])
        return x + self.proj_out(h)


class ResBlockEmb3D(nn.Module):
    def __init__(self, channels, emb_channels, dropout=0, out_channels=None):
        super().__init__()
        self.out_channels = out_channels or channels
        self.in_layers = nn.Sequential(
            normalization(channels), nn.SiLU(),
            nn.Conv3d(channels, self.out_channels, 3, padding=1),
        )
        self.emb_layers = nn.Sequential(
            nn.SiLU(), nn.Linear(emb_channels, 2 * self.out_channels),
        )
        self.out_norm = normalization(self.out_channels)
        self.out_layers = nn.Sequential(
            nn.SiLU(), nn.Dropout(p=dropout),
            zero_module(nn.Conv3d(self.out_channels, self.out_channels, 3, padding=1)),
        )
        self.skip = (
            nn.Conv3d(channels, self.out_channels, 1)
            if self.out_channels != channels else nn.Identity()
        )

    def forward(self, x, emb):
        h = self.in_layers(x)
        emb_out = self.emb_layers(emb).type(h.dtype)
        while len(emb_out.shape) < len(h.shape):
            emb_out = emb_out[..., None]
        scale, shift = torch.chunk(emb_out, 2, dim=1)
        h = self.out_norm(h) * (1 + scale) + shift
        h = self.out_layers(h)
        return self.skip(x) + h


class TemporalConv3D(nn.Module):
    def __init__(self, channels, kernel_size=5):
        super().__init__()
        padding = kernel_size // 2
        self.norm = normalization(channels)
        self.dwconv = nn.Conv3d(channels, channels,
                                kernel_size=(kernel_size, 1, 1),
                                padding=(padding, 0, 0),
                                groups=channels)
        self.pwconv = nn.Conv3d(channels, channels, kernel_size=1)
        nn.init.zeros_(self.pwconv.weight)
        nn.init.zeros_(self.pwconv.bias)

    def forward(self, x):
        identity = x
        h = self.norm(x)
        h = F.silu(h)
        h = self.dwconv(h)
        h = self.pwconv(h)
        return identity + h


class LatentResizer3D(nn.Module):
    def __init__(self, in_channels=24, in_blocks=12, out_blocks=12,
                 channels=512, dropout=0.1, attn=False,
                 temporal_every=2, temporal_kernel=5):
        super().__init__()
        self.conv_in = nn.Conv3d(in_channels, channels, 3, padding=1)
        embed_dim = 64
        self.embed = nn.Sequential(
            nn.Linear(1, embed_dim), nn.SiLU(), nn.Linear(embed_dim, embed_dim))
        self.in_blocks = nn.ModuleList()
        for b in range(in_blocks):
            if (b == 1 or b == in_blocks - 1) and attn:
                self.in_blocks.append(AttnBlock3D(channels))
            self.in_blocks.append(ResBlockEmb3D(channels, embed_dim, dropout))
            if temporal_every > 0 and b % temporal_every == 0:
                self.in_blocks.append(TemporalConv3D(channels, temporal_kernel))
        self.out_blocks = nn.ModuleList()
        for b in range(out_blocks):
            if (b == 1 or b == out_blocks - 1) and attn:
                self.out_blocks.append(AttnBlock3D(channels))
            self.out_blocks.append(ResBlockEmb3D(channels, embed_dim, dropout))
            if temporal_every > 0 and b % temporal_every == 0:
                self.out_blocks.append(TemporalConv3D(channels, temporal_kernel))
        self.norm_out = normalization(channels)
        self.conv_out = nn.Conv3d(channels, in_channels, 3, padding=1)

    def forward(self, x, scale=None, target_size=None, enable_chunking=True):
        if target_size is not None:
            size = target_size
        elif scale is not None:
            size = tuple(int(round(s * scale)) for s in x.shape[-3:])
        else:
            return x
        if size == x.shape[-3:]:
            return x
        B, C, T, H, W = x.shape
        tk = 0
        for b in self.in_blocks:
            if isinstance(b, TemporalConv3D):
                tk = b.dwconv.weight.shape[2]
                break
        overlap = tk
        chunk = 32
        if not enable_chunking or T <= chunk:
            return self._forward_seg(x, scale, size)
        print(f"[MinimaxH3-3D] temporal chunking: T={T} chunks={(T + chunk - 1) // chunk} overlap={overlap}")
        x_padded = F.pad(x, (0, 0, 0, 0, overlap, overlap), mode='replicate')
        out_full = torch.zeros(B, C, T, size[-2], size[-1], device=x.device, dtype=x.dtype)
        weight_full = torch.zeros(1, 1, T, 1, 1, device=x.device, dtype=x.dtype)
        start = 0
        while start < T:
            seg_start = start
            seg_end = min(T, start + chunk)
            out_start = max(0, seg_start - overlap)
            out_end = min(T, seg_end + overlap)
            lo = max(0, out_start - overlap)
            hi = min(T + 2 * overlap, out_end + overlap)
            seg = x_padded[:, :, lo:hi].contiguous()
            seg_size = (hi - lo, size[-2], size[-1])
            seg_out = self._forward_seg(seg, scale, seg_size)
            s0 = (out_start + overlap) - lo
            s1 = s0 + (out_end - out_start)
            valid_out = seg_out[:, :, s0:s1]
            n_valid = out_end - out_start
            weight = torch.ones(n_valid, device=x.device, dtype=x.dtype)
            if seg_start > out_start:
                blend_len = seg_start - out_start
                weight[:blend_len] = torch.arange(1, blend_len + 1, device=x.device, dtype=x.dtype) / (blend_len + 1)
            if out_end > seg_end:
                blend_len = out_end - seg_end
                weight[-blend_len:] = torch.arange(blend_len, 0, -1, device=x.device, dtype=x.dtype) / (blend_len + 1)
            out_full[:, :, out_start:out_end] += valid_out * weight.view(1, 1, n_valid, 1, 1)
            weight_full[:, :, out_start:out_end] += weight.view(1, 1, n_valid, 1, 1)
            start += chunk
            del seg, seg_out, valid_out
            if start % (chunk * 4) == 0:
                gc.collect()
        out_full = out_full / weight_full.clamp(min=1e-8)
        return out_full

    def _forward_seg(self, x, scale, size):
        scale_emb = torch.tensor(
            [scale - 1 if scale is not None else 0.0],
            dtype=x.dtype, device=x.device).unsqueeze(0)
        emb = self.embed(scale_emb)
        x = self.conv_in(x)
        for b in self.in_blocks:
            if isinstance(b, ResBlockEmb3D):
                emb_t = emb.expand(x.shape[0], -1)
                x = b(x, emb_t)
            else:
                x = b(x)
        x = F.interpolate(x, size=size, mode="trilinear", align_corners=False)
        for b in self.out_blocks:
            if isinstance(b, ResBlockEmb3D):
                emb_t = emb.expand(x.shape[0], -1)
                x = b(x, emb_t)
            else:
                x = b(x)
        x = self.norm_out(x)
        x = F.silu(x)
        x = self.conv_out(x)
        return x


# ==========================================
# 模型加载 (2D)
# ==========================================
_MODEL_CACHE_2D = {}


def _detect_arch_2d(sd):
    cfg = {
        "in_channels": 24, "in_blocks": 12, "out_blocks": 12, "channels": 640,
        "dropout": 0.1, "attn": False, "temporal_every": 2, "temporal_kernel": 5,
    }
    if 'resizer.conv_in.weight' in sd:
        w = sd['resizer.conv_in.weight']
        cfg["in_channels"] = w.shape[1]
        cfg["channels"] = w.shape[0]
    in_ids, out_ids = set(), set()
    for k in sd.keys():
        m = re.match(r'resizer\.in_blocks\.(\d+)\.in_layers\.', k)
        if m: in_ids.add(int(m.group(1)))
        m = re.match(r'resizer\.out_blocks\.(\d+)\.in_layers\.', k)
        if m: out_ids.add(int(m.group(1)))
    if in_ids: cfg["in_blocks"] = len(in_ids)
    if out_ids: cfg["out_blocks"] = len(out_ids)
    has_temporal = any('temporal_blocks' in k for k in sd)
    if has_temporal:
        for k in sd.keys():
            if 'temporal_blocks.0.dwconv.weight' in k:
                cfg["temporal_kernel"] = sd[k].shape[2]
                break
        cfg["temporal_every"] = 2
    else:
        cfg["temporal_every"] = 0
    cfg["attn"] = False
    return cfg


def load_model_2d(name, device, precision):
    cache_key = f"{name}::{device}::{precision}"
    if cache_key in _MODEL_CACHE_2D:
        return _MODEL_CACHE_2D[cache_key]
    try:
        path = folder_paths.get_full_path_or_raise(_LATENT_UPSCALE_FOLDER, name)
    except Exception:
        path = os.path.join(get_models_dir(), name)
    raw_sd = _load_raw_sd(path)
    up_sd = _extract_upscaler_sd(raw_sd)
    cfg = _detect_arch_2d(up_sd)
    model = VideoLatentResizer(
        in_channels=cfg["in_channels"], in_blocks=cfg["in_blocks"],
        out_blocks=cfg["out_blocks"], channels=cfg["channels"],
        dropout=cfg["dropout"], attn=cfg["attn"],
        temporal_every=cfg["temporal_every"],
        temporal_kernel=cfg["temporal_kernel"],
    )
    missing, unexpected = model.load_state_dict(up_sd, strict=False)
    if missing:
        print(f"[MinimaxH3-2D] missing keys: {missing[:5]}... (attn forced off)")
    if unexpected:
        print(f"[MinimaxH3-2D] unexpected keys: {unexpected[:5]}...")
    dtype = {"fp32": torch.float32, "fp16": torch.float16, "bf16": torch.bfloat16}.get(precision, torch.float32)
    model = model.to(device).eval()
    if dtype != torch.float32:
        model = model.to(dtype)
    _MODEL_CACHE_2D[cache_key] = model
    print(f"[MinimaxH3-2D] Loaded: {name}")
    print(f"  Params: {sum(p.numel() for p in model.parameters()):,} | "
          f"Temporal: {'on' if cfg['temporal_every'] > 0 else 'off'} "
          f"(every={cfg['temporal_every']}, kernel={cfg['temporal_kernel']})")
    return model


# ==========================================
# 模型加载 (3D)
# ==========================================
_MODEL_CACHE_3D = {}


def _detect_arch_3d(sd):
    cfg = {
        "in_channels": 24, "in_blocks": 12, "out_blocks": 12, "channels": 512,
        "dropout": 0.1, "attn": False, "temporal_every": 2, "temporal_kernel": 5,
    }
    if 'conv_in.weight' in sd:
        cfg["in_channels"] = sd['conv_in.weight'].shape[1]
        cfg["channels"] = sd['conv_in.weight'].shape[0]
    in_ids, out_ids = set(), set()
    temporal_in_indices, temporal_out_indices = set(), set()
    for k in sd.keys():
        m = re.match(r'in_blocks\.(\d+)\.in_layers\.', k)
        if m: in_ids.add(int(m.group(1)))
        m = re.match(r'out_blocks\.(\d+)\.in_layers\.', k)
        if m: out_ids.add(int(m.group(1)))
        m = re.match(r'in_blocks\.(\d+)\.dwconv\.weight', k)
        if m: temporal_in_indices.add(int(m.group(1)))
        m = re.match(r'out_blocks\.(\d+)\.dwconv\.weight', k)
        if m: temporal_out_indices.add(int(m.group(1)))
    if in_ids: cfg["in_blocks"] = len(in_ids)
    if out_ids: cfg["out_blocks"] = len(out_ids)
    if temporal_in_indices or temporal_out_indices:
        cfg["temporal_every"] = 2
        for k in sd.keys():
            if 'dwconv.weight' in k and k.endswith('dwconv.weight'):
                cfg["temporal_kernel"] = sd[k].shape[2]
                break
    else:
        cfg["temporal_every"] = 0
    cfg["attn"] = False
    return cfg


def load_model_3d(name, device, precision):
    backend_lbl = _backend_label(device)
    cache_key = f"{name}::{backend_lbl}::{precision}"
    if cache_key in _MODEL_CACHE_3D:
        model = _MODEL_CACHE_3D[cache_key]
        return model.to(device, non_blocking=True)
    try:
        path = folder_paths.get_full_path_or_raise(_LATENT_UPSCALE_FOLDER, name)
    except Exception as e:
        raise FileNotFoundError(f"Model file not found: {name}") from e
    raw_sd = _load_raw_sd(path)
    up_sd = _extract_upscaler_sd(raw_sd)
    cfg = _detect_arch_3d(up_sd)
    model = LatentResizer3D(
        in_channels=cfg["in_channels"], in_blocks=cfg["in_blocks"],
        out_blocks=cfg["out_blocks"], channels=cfg["channels"],
        dropout=cfg["dropout"], attn=cfg["attn"],
        temporal_every=cfg["temporal_every"],
        temporal_kernel=cfg["temporal_kernel"],
    )
    model.load_state_dict(up_sd, strict=True)
    dtype = {"fp32": torch.float32, "fp16": torch.float16, "bf16": torch.bfloat16}.get(precision, torch.float32)
    model = model.to(device).eval().requires_grad_(False)
    if dtype != torch.float32:
        model = model.to(dtype)
    _MODEL_CACHE_3D[cache_key] = model
    print(f"[MinimaxH3-3D] Loaded: {name}")
    print(f"  Params: {sum(p.numel() for p in model.parameters()):,} | "
          f"Temporal: {'on' if cfg['temporal_every'] > 0 else 'off'} "
          f"(every={cfg['temporal_every']}, kernel={cfg['temporal_kernel']}) | "
          f"Backend: {backend_lbl} | Precision: {precision}")
    return model


# ==========================================
# 2D 节点 (传统格式)
# ==========================================
class wcx_MinimaxH3LatentUpscaler2D:
    """Minimax H3 Latent Upscaler (2D主干 + Temporal)，scale 1.0~4.0"""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "latent": ("LATENT",),
                "model_name": (scan_models(),),
                "scale": ("FLOAT", {"default": 2.0, "min": 1.0, "max": 4.0, "step": 0.1}),
                "device": (["cuda", "cpu"], {"default": "cuda"}),
                "precision": (["fp32", "fp16", "bf16"], {"default": "fp32"}),
            }
        }

    RETURN_TYPES = ("LATENT",)
    FUNCTION = "run"
    CATEGORY = "Practical-Tools/Latent"

    def run(self, latent, model_name, scale, device, precision):
        if model_name.startswith('('):
            raise ValueError("请将模型文件放入 latent_upscale_models 目录")
        if abs(scale - 1.0) < 1e-6:
            return (latent,)
        if scale < 1.0:
            raise ValueError("仅支持放大 (scale >= 1.0)")
        dev = torch.device(device if torch.cuda.is_available() else "cpu")
        model = load_model_2d(model_name, dev, precision)
        s = latent["samples"].clone()
        orig_dtype = s.dtype
        if len(s.shape) == 4:
            s = s.unsqueeze(2)
        compute_dtype = {"fp32": torch.float32, "fp16": torch.float16, "bf16": torch.bfloat16}[precision]
        s = s.to(dev, compute_dtype)
        norm_mean, norm_std = _make_norm_tensors(dev, compute_dtype)
        s = (s - norm_mean) / norm_std
        with torch.no_grad():
            T, H, W = s.shape[2], s.shape[3], s.shape[4]
            target_hw = (int(round(H * scale)), int(round(W * scale)))
            out = model(s, scale=scale, target_hw=target_hw)
        out = out * norm_std + norm_mean
        if len(latent["samples"].shape) == 4:
            out = out.squeeze(2)
        out = out.cpu().to(orig_dtype)
        if dev.type == "cuda":
            torch.cuda.empty_cache()
        return ({"samples": out},)


# ==========================================
# 3D 节点 (传统格式，从新API适配)
# ==========================================
class wcx_MinimaxH3LatentUpscaler3D:
    """Minimax H3 Latent Upscaler (纯3D卷积)，支持3种尺寸设定模式 + 时间分块"""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "latent": ("LATENT",),
                "model_name": (scan_models(),),
                "mode": (["scale by multiplier", "target dimensions", "megapixels"], {"default": "scale by multiplier"}),
                "scale": ("FLOAT", {"default": 2.0, "min": 1.0, "max": 4.0, "step": 0.05}),
                "width": ("INT", {"default": 1280, "min": 64, "max": 8192, "step": 8}),
                "height": ("INT", {"default": 704, "min": 64, "max": 8192, "step": 8}),
                "megapixels": ("FLOAT", {"default": 1.0, "min": 0.1, "max": 16.0, "step": 0.1}),
                "align": ("INT", {"default": 32, "min": 1, "max": 512, "step": 1}),
                "enable_temporal_chunking": ("BOOLEAN", {"default": True}),
                "force_unload": ("BOOLEAN", {"default": True}),
                "device": (["cuda", "rocm", "cpu"], {"default": "cuda"}),
                "precision": (["fp32", "fp16", "bf16"], {"default": "fp16"}),
            }
        }

    RETURN_TYPES = ("LATENT",)
    FUNCTION = "run"
    CATEGORY = "Practical-Tools/Latent"

    def run(self, latent, model_name, mode, scale, width, height, megapixels,
            align, enable_temporal_chunking, force_unload, device, precision):
        if model_name.startswith('('):
            raise ValueError("Please place model files into the latent_upscale_models directory")
        src = latent["samples"]
        orig_dtype = src.dtype
        was_4d = (src.dim() == 4)
        dev = _resolve_device(device)
        compute_dtype = {"fp32": torch.float32, "fp16": torch.float16, "bf16": torch.bfloat16}[precision]
        s = src.to(device=dev, dtype=compute_dtype, copy=True)
        if was_4d:
            s = s.unsqueeze(2)
        b, c, t, h_in, w_in = s.shape
        downsample = VAE_DOWNSAMPLE

        # 计算目标尺寸
        if mode == "scale by multiplier":
            w_pixel_target = w_in * downsample * scale
            h_pixel_target = h_in * downsample * scale
            effective_scale = scale
        elif mode == "target dimensions":
            w_pixel_target = float(width)
            h_pixel_target = float(height)
            effective_scale = (w_pixel_target / (w_in * downsample) + h_pixel_target / (h_in * downsample)) / 2.0
        elif mode == "megapixels":
            mp = megapixels
            target_pixels = mp * 1024 * 1024
            aspect_ratio = w_in / h_in
            h_pixel_target = (target_pixels / aspect_ratio) ** 0.5
            w_pixel_target = h_pixel_target * aspect_ratio
            effective_scale = (w_pixel_target / (w_in * downsample) + h_pixel_target / (h_in * downsample)) / 2.0
        else:
            raise ValueError(f"Unsupported mode: {mode}")

        # 像素空间对齐
        alignment = max(1, align)
        w_pixel_aligned = round(w_pixel_target / alignment) * alignment
        h_pixel_aligned = round(h_pixel_target / alignment) * alignment
        w_pixel_final = round(w_pixel_aligned / downsample) * downsample
        h_pixel_final = round(h_pixel_aligned / downsample) * downsample
        w_out = max(1, int(w_pixel_final // downsample))
        h_out = max(1, int(h_pixel_final // downsample))

        if effective_scale < 1.0 and (w_out < w_in or h_out < h_in):
            raise ValueError("This model only supports upscaling (effective scale >= 1.0).")
        if w_out == w_in and h_out == h_in:
            return (latent,)

        print(f"[MinimaxH3-3D] Latent {w_in}x{h_in} -> {w_out}x{h_out} | "
              f"Pixels {w_out * downsample}x{h_out * downsample} | scale={effective_scale:.3f}")

        # 推理
        model = load_model_3d(model_name, dev, precision)
        norm_mean, norm_std = _make_norm_tensors(dev, compute_dtype)
        with torch.inference_mode():
            s_norm = (s - norm_mean) / norm_std
            del s
            out = model(s_norm, scale=effective_scale, target_size=(t, h_out, w_out),
                        enable_chunking=enable_temporal_chunking)
            del s_norm
            out = out * norm_std + norm_mean
        if was_4d:
            out = out.squeeze(2)
        out = out.to(device="cpu", dtype=orig_dtype, non_blocking=True)

        # 显存管理
        if dev.type == "cuda":
            if force_unload:
                model.to("cpu", non_blocking=True)
                print("[MinimaxH3-3D] Model offloaded to CPU. VRAM released.")
            if HAS_COMFY_MM:
                mm.soft_empty_cache()
            else:
                torch.cuda.empty_cache()
            gc.collect()
        return ({"samples": out},)


# ==========================================
# 节点注册
# ==========================================
NODE_CLASS_MAPPINGS = {
    "wcx_MinimaxH3LatentUpscaler2D": wcx_MinimaxH3LatentUpscaler2D,
    "wcx_MinimaxH3LatentUpscaler3D": wcx_MinimaxH3LatentUpscaler3D,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_MinimaxH3LatentUpscaler2D": "Minimax H3 Latent Upscaler (2D)",
    "wcx_MinimaxH3LatentUpscaler3D": "Minimax H3 Latent Upscaler (3D)",
}
