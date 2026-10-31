"""VOSR 2.0 节点（Practical-Tools 移植版）

分类：Practical-Tools/VOSR2
已去除自动下载功能，模型文件需手动放置到 models/vosr2/ 目录。
"""
import sys

import torch
import torch.nn.functional as F

from vosr2 import loader
from vosr2.inference import run_vosr2
from vosr2.loader import VOSR2Model

# 模型缓存：key=(model_name, dtype)，避免重复加载
_model_cache = {}


class VOSR2Upscale:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": (loader.model_options(), {"default": loader.KNOWN_MODEL}),
                "dtype": (["default", "fp16", "bf16"], {"default": "default"}),
                "image": ("IMAGE",),
                "upscale": ("INT", {"default": 4, "min": 1, "max": sys.maxsize}),
                "strength": (
                    "FLOAT",
                    {
                        "default": 1.0,
                        "min": 0.0,
                        "max": 1.0,
                        "step": 0.01,
                        "tooltip": "超分强度（残差混合）。1.0=完全VOSR2输出，0.0=纯双三次放大，中间值保留更多原图纹理",
                    },
                ),
                "seed": ("INT", {"default": 42, "min": 0, "max": sys.maxsize}),
                "color_alignment": (["wavelet", "adain", "none"], {"default": "wavelet"}),
                "tiled_dit": ("BOOLEAN", {"default": True, "tooltip": "Enable DiT tiling. Disable for faster but higher VRAM."}),
                "tile_size": ("INT", {"default": 512, "min": 64, "max": 4096, "step": 64, "tooltip": "DiT tile size; only effective when tiled_dit is enabled."}),
                "tile_overlap": ("INT", {"default": 32, "min": 0, "max": 512, "step": 8}),
                "tiled_vae": ("BOOLEAN", {"default": True, "tooltip": "Enable VAE tiling. Disable for faster decode but higher VRAM."}),
                "vae_tile_size": ("INT", {"default": 1024, "min": 64, "max": 8192, "step": 64, "tooltip": "VAE tile size; only effective when tiled_vae is enabled."}),
                "vae_tile_overlap": ("INT", {"default": 32, "min": 0, "max": 512, "step": 8}),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "upscale"
    CATEGORY = "Practical-Tools/SResolution"

    def upscale(self, model, dtype, image, upscale, strength, seed, color_alignment, tiled_dit, tile_size, tile_overlap, tiled_vae, vae_tile_size, vae_tile_overlap):
        # 模型缓存
        cache_key = (model, dtype)
        if cache_key not in _model_cache:
            _model_cache[cache_key] = loader.load_vosr2(model, dtype)
        bundle = _model_cache[cache_key]

        # 开关关闭时强制 tile_size=0，用户设置的分块参数不生效
        _tile_size = tile_size if tiled_dit else 0
        _vae_tile_size = vae_tile_size if tiled_vae else 0

        if _tile_size > 0 and tile_overlap >= _tile_size:
            raise ValueError(f"tile_overlap ({tile_overlap}) must be smaller than tile_size ({_tile_size}).")
        if _vae_tile_size > 0 and vae_tile_overlap >= _vae_tile_size:
            raise ValueError(f"vae_tile_overlap ({vae_tile_overlap}) must be smaller than vae_tile_size ({_vae_tile_size}).")

        result = run_vosr2(
            bundle, image, upscale, seed, color_alignment,
            _tile_size, tile_overlap, _vae_tile_size, vae_tile_overlap,
        )

        # 残差强度混合：VOSR2输出 = 双三次放大 + 模型残差
        # 输出 = 双三次放大 + 残差 × strength
        if strength < 1.0:
            alpha = image[..., 3:4] if image.shape[-1] > 3 else None
            rgb = image[..., :3]

            # 双三次放大到目标尺寸（BHWC -> BCHW -> interpolate -> BHWC）
            target_h, target_w = result.shape[1], result.shape[2]
            bicubic = F.interpolate(
                rgb.movedim(-1, 1),
                size=(target_h, target_w),
                mode="bicubic",
                align_corners=False,
            ).movedim(1, -1).clamp(0.0, 1.0)

            # 残差 = VOSR2输出 - 双三次基准
            residual = result[..., :3] - bicubic
            # 输出 = 基准 + 残差 × strength
            blended = bicubic + residual * strength

            if alpha is not None:
                # alpha 通道也双三次放大
                alpha_up = F.interpolate(
                    alpha.movedim(-1, 1),
                    size=(target_h, target_w),
                    mode="bicubic",
                    align_corners=False,
                ).movedim(1, -1).clamp(0.0, 1.0)
                result = torch.cat((blended, alpha_up), dim=-1)
            else:
                result = blended

        return (result,)


NODE_CLASS_MAPPINGS = {
    "wcx_VOSR2Upscale": VOSR2Upscale,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_VOSR2Upscale": "VOSR2",
}
