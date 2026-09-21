"""
GGUF CLIP Loader —— 加载 GGUF 格式的 CLIP/文本编码器
核心逻辑改编自 ComfyUI-GGUF (city96)，Apache-2.0 License
https://github.com/city96/ComfyUI-GGUF
"""

import os
import torch
import logging

import nodes
import folder_paths
import comfy.sd
import comfy.utils
import comfy.model_management

# 导入 GGUF 核心模块
from gguf_core.ops import GGMLOps
from gguf_core.loader import gguf_clip_loader
from gguf_core.dequant import is_quantized, is_torch_compatible

# 复用 GGUFModelPatcher（从 UNET Loader 模块导入，避免重复定义）
from GGUF_UNET_Loader import GGUFModelPatcher

# 注册 GGUF CLIP 文件类型
def _register_clip_gguf_folder():
    key = "clip_gguf"
    if key in folder_paths.folder_names_and_paths:
        return
    base = folder_paths.folder_names_and_paths.get("text_encoders", ([], {}))
    if not base or not base[0]:
        base = folder_paths.folder_names_and_paths.get("clip", ([], {}))
    paths = base[0] if isinstance(base, tuple) and base else []
    folder_paths.folder_names_and_paths[key] = (paths, {".gguf"})

_register_clip_gguf_folder()


def _get_clip_filename_list():
    """获取 CLIP 文件列表（包含普通和 GGUF 格式）"""
    files = []
    files += folder_paths.get_filename_list("clip")
    files += folder_paths.get_filename_list("clip_gguf")
    return sorted(files)


def _load_clip_data(clip_paths):
    """加载 CLIP 权重数据，自动识别 GGUF 和普通格式"""
    clip_data = []
    for p in clip_paths:
        if p.endswith(".gguf"):
            sd = gguf_clip_loader(p)
        else:
            sd = comfy.utils.load_torch_file(p, safe_load=True)
            if "scaled_fp8" in sd:
                raise NotImplementedError(f"Mixing scaled FP8 with GGUF is not supported! Use regular CLIP loader or switch model(s)\n({p})")
        clip_data.append(sd)
    return clip_data


def _load_clip_patcher(clip_paths, clip_type, clip_data):
    """加载 CLIP 模型并用 GGUFModelPatcher 包装"""
    clip = comfy.sd.load_text_encoder_state_dicts(
        clip_type=clip_type,
        state_dicts=clip_data,
        model_options={
            "custom_operations": GGMLOps,
            "initial_device": comfy.model_management.text_encoder_offload_device()
        },
        embedding_directory=folder_paths.get_folder_paths("embeddings"),
    )
    clip.patcher = GGUFModelPatcher.clone(clip.patcher)
    return clip


class wcx_GGUFCLIPLoader:
    """加载 GGUF 格式的 CLIP/文本编码器（单模型）"""

    @classmethod
    def INPUT_TYPES(cls):
        base = nodes.CLIPLoader.INPUT_TYPES()
        return {
            "required": {
                "clip_name": (_get_clip_filename_list(),),
                "type": base["required"]["type"],
            }
        }

    RETURN_TYPES = ("CLIP",)
    FUNCTION = "load_clip"
    CATEGORY = "Practical-Tools/loaders"

    def load_clip(self, clip_name, type="stable_diffusion"):
        clip_path = folder_paths.get_full_path("clip", clip_name)
        clip_type = getattr(comfy.sd.CLIPType, type.upper(), comfy.sd.CLIPType.STABLE_DIFFUSION)
        clip_data = _load_clip_data([clip_path])
        clip = _load_clip_patcher([clip_path], clip_type, clip_data)
        return (clip,)


class wcx_GGUFDualCLIPLoader:
    """加载 GGUF 格式的双 CLIP/文本编码器（用于 SD3、Flux 等）"""

    @classmethod
    def INPUT_TYPES(cls):
        base = nodes.DualCLIPLoader.INPUT_TYPES()
        file_options = (_get_clip_filename_list(),)
        return {
            "required": {
                "clip_name1": file_options,
                "clip_name2": file_options,
                "type": base["required"]["type"],
            }
        }

    RETURN_TYPES = ("CLIP",)
    FUNCTION = "load_clip"
    CATEGORY = "Practical-Tools/loaders"

    def load_clip(self, clip_name1, clip_name2, type):
        clip_path1 = folder_paths.get_full_path("clip", clip_name1)
        clip_path2 = folder_paths.get_full_path("clip", clip_name2)
        clip_paths = (clip_path1, clip_path2)
        clip_type = getattr(comfy.sd.CLIPType, type.upper(), comfy.sd.CLIPType.STABLE_DIFFUSION)
        clip_data = _load_clip_data(clip_paths)
        clip = _load_clip_patcher(clip_paths, clip_type, clip_data)
        return (clip,)


NODE_CLASS_MAPPINGS = {
    "wcx_GGUFCLIPLoader": wcx_GGUFCLIPLoader,
    "wcx_GGUFDualCLIPLoader": wcx_GGUFDualCLIPLoader,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_GGUFCLIPLoader": "GGUF CLIP Loader",
    "wcx_GGUFDualCLIPLoader": "GGUF Dual CLIP Loader",
}
