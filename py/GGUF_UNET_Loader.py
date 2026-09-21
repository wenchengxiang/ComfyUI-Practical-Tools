"""
GGUF UNET Loader —— 加载 GGUF 格式的 UNet/扩散模型
核心逻辑改编自 ComfyUI-GGUF (city96)，Apache-2.0 License
https://github.com/city96/ComfyUI-GGUF
"""

import os
import sys
import torch
import logging
import inspect
import collections

import folder_paths
import comfy.sd
import comfy.lora
import comfy.float
import comfy.utils
import comfy.model_patcher
import comfy.model_management

# 导入 GGUF 核心模块（绝对导入，py 目录已加入 sys.path）
from gguf_core.ops import GGMLOps, move_patch_to_device
from gguf_core.loader import gguf_sd_loader
from gguf_core.dequant import is_quantized, is_torch_compatible

# 注册 GGUF 文件类型
def _register_gguf_folder():
    key = "unet_gguf"
    if key in folder_paths.folder_names_and_paths:
        return
    base = folder_paths.folder_names_and_paths.get("diffusion_models", ([], {}))
    paths = base[0] if isinstance(base, tuple) and base else []
    folder_paths.folder_names_and_paths[key] = (paths, {".gguf"})

_register_gguf_folder()


class GGUFModelPatcher(comfy.model_patcher.ModelPatcher):
    """GGUF 量化模型的 ModelPatcher，支持量化权重的 patch"""
    patch_on_device = False

    def patch_weight_to_device(self, key, device_to=None, inplace_update=False):
        if key not in self.patches:
            return
        weight = comfy.utils.get_attr(self.model, key)

        patches = self.patches[key]
        if is_quantized(weight):
            out_weight = weight.to(device_to)
            patches = move_patch_to_device(patches, self.load_device if self.patch_on_device else self.offload_device)
            out_weight.patches = [(patches, key)]
        else:
            inplace_update = self.weight_inplace_update or inplace_update
            if key not in self.backup:
                self.backup[key] = collections.namedtuple('Dimension', ['weight', 'inplace_update'])(
                    weight.to(device=self.offload_device, copy=inplace_update), inplace_update
                )

            if device_to is not None:
                temp_weight = comfy.model_management.cast_to_device(weight, device_to, torch.float32, copy=True)
            else:
                temp_weight = weight.to(torch.float32, copy=True)

            out_weight = comfy.lora.calculate_weight(patches, temp_weight, key)
            out_weight = comfy.float.stochastic_rounding(out_weight, weight.dtype)

        if inplace_update:
            comfy.utils.copy_to_param(self.model, key, out_weight)
        else:
            comfy.utils.set_attr_param(self.model, key, out_weight)

    def unpatch_model(self, device_to=None, unpatch_weights=True):
        if unpatch_weights:
            for p in self.model.parameters():
                if is_torch_compatible(p):
                    continue
                patches = getattr(p, "patches", [])
                if len(patches) > 0:
                    p.patches = []
        return super().unpatch_model(device_to=device_to, unpatch_weights=unpatch_weights)


class wcx_GGUFUNETLoader:
    """加载 GGUF 格式的 UNet/扩散模型"""

    @classmethod
    def INPUT_TYPES(cls):
        unet_names = folder_paths.get_filename_list("unet_gguf")
        return {
            "required": {
                "unet_name": (unet_names,),
            },
            "optional": {
                "dequant_dtype": (["default", "target", "float32", "float16", "bfloat16"], {"default": "default"}),
                "patch_dtype": (["default", "target", "float32", "float16", "bfloat16"], {"default": "default"}),
            }
        }

    RETURN_TYPES = ("MODEL",)
    FUNCTION = "load_unet"
    CATEGORY = "Practical-Tools/loaders"

    def load_unet(self, unet_name, dequant_dtype="default", patch_dtype="default"):
        ops = GGMLOps()

        if dequant_dtype in ("default", None):
            ops.Linear.dequant_dtype = None
        elif dequant_dtype == "target":
            ops.Linear.dequant_dtype = dequant_dtype
        else:
            ops.Linear.dequant_dtype = getattr(torch, dequant_dtype)

        if patch_dtype in ("default", None):
            ops.Linear.patch_dtype = None
        elif patch_dtype == "target":
            ops.Linear.patch_dtype = patch_dtype
        else:
            ops.Linear.patch_dtype = getattr(torch, patch_dtype)

        # 加载模型
        unet_path = folder_paths.get_full_path("unet", unet_name)
        sd, extra = gguf_sd_loader(unet_path)

        kwargs = {}
        valid_params = inspect.signature(comfy.sd.load_diffusion_model_state_dict).parameters
        if "metadata" in valid_params:
            kwargs["metadata"] = extra.get("metadata", {})

        model = comfy.sd.load_diffusion_model_state_dict(
            sd, model_options={"custom_operations": ops}, **kwargs,
        )
        if model is None:
            logging.error(f"ERROR UNSUPPORTED UNET {unet_path}")
            raise RuntimeError(f"ERROR: Could not detect model type of: {unet_path}")

        model = GGUFModelPatcher.clone(model)
        return (model,)


NODE_CLASS_MAPPINGS = {
    "wcx_GGUFUNETLoader": wcx_GGUFUNETLoader,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_GGUFUNETLoader": "GGUF UNET Loader",
}
