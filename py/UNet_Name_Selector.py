"""
UNet Name Selector —— UNet 模型名称选择器
只选择模型名称（包含普通 UNet 和 GGUF 格式），输出名称字符串，不加载模型。
"""

import os
import folder_paths


class wcx_UNetNameSelector:
    """UNet 模型名称选择器：只选名称，不加载模型"""

    @classmethod
    def INPUT_TYPES(cls):
        # 合并普通 UNet 和 GGUF UNet 文件列表
        unet_names = []
        unet_names += folder_paths.get_filename_list("unet")
        unet_names += folder_paths.get_filename_list("diffusion_models")
        unet_names += folder_paths.get_filename_list("unet_gguf")
        # 去重并排序
        unet_names = sorted(list(set(unet_names)))
        return {
            "required": {
                "unet_name": (unet_names,),
            }
        }

    RETURN_TYPES = ("STRING", "INT")
    RETURN_NAMES = ("unet_name", "model_type")
    FUNCTION = "select_name"
    CATEGORY = "Practical-Tools/loaders"
    OUTPUT_NODE = False

    def select_name(self, unet_name):
        # 根据扩展名判断模型类型：0=safetensors, 1=gguf
        if unet_name.lower().endswith(".gguf"):
            model_type = 1
        else:
            model_type = 0
        return (unet_name, model_type)


NODE_CLASS_MAPPINGS = {
    "wcx_UNetNameSelector": wcx_UNetNameSelector,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_UNetNameSelector": "UNet Name Selector",
}
