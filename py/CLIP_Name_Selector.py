"""
CLIP Name Selector —— CLIP 模型名称选择器
只选择模型名称（包含普通 CLIP 和 GGUF 格式），输出名称字符串和类型，不加载模型。
"""

import os
import folder_paths


class wcx_CLIPNameSelector:
    """CLIP 模型名称选择器：只选名称，不加载模型"""

    @classmethod
    def INPUT_TYPES(cls):
        # 合并普通 CLIP 和 GGUF CLIP 文件列表
        clip_names = []
        clip_names += folder_paths.get_filename_list("clip")
        clip_names += folder_paths.get_filename_list("text_encoders")
        clip_names += folder_paths.get_filename_list("clip_gguf")
        # 去重并排序
        clip_names = sorted(list(set(clip_names)))
        return {
            "required": {
                "clip_name": (clip_names,),
            }
        }

    RETURN_TYPES = ("STRING", "INT")
    RETURN_NAMES = ("clip_name", "model_type")
    FUNCTION = "select_name"
    CATEGORY = "Practical-Tools/loaders"
    OUTPUT_NODE = False

    def select_name(self, clip_name):
        # 根据扩展名判断模型类型：0=safetensors, 1=gguf
        if clip_name.lower().endswith(".gguf"):
            model_type = 1
        else:
            model_type = 0
        return (clip_name, model_type)


NODE_CLASS_MAPPINGS = {
    "wcx_CLIPNameSelector": wcx_CLIPNameSelector,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_CLIPNameSelector": "CLIP Name Selector",
}
