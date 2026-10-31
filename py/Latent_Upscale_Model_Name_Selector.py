"""
Latent Upscale Model Name Selector —— 潜空间放大模型名称选择器
只选择模型名称，输出名称字符串，不加载模型。
覆盖 latent_upscale_models 文件夹（MiniMax H3 等潜空间放大模型）。
"""

import os
import folder_paths


# 确保模型文件夹已注册（与 Minimax_H3_Latent_Upscaler 共享）
_LATENT_UPSCALE_FOLDER = "latent_upscale_models"
if _LATENT_UPSCALE_FOLDER not in folder_paths.folder_names_and_paths:
    folder_paths.add_model_folder_path(
        _LATENT_UPSCALE_FOLDER,
        os.path.join(folder_paths.models_dir, _LATENT_UPSCALE_FOLDER)
    )


class wcx_LatentUpscaleModelNameSelector:
    """潜空间放大模型名称选择器：只选名称，不加载模型"""

    @classmethod
    def INPUT_TYPES(cls):
        model_names = folder_paths.get_filename_list(_LATENT_UPSCALE_FOLDER)
        # 只保留常见权重格式
        model_names = [
            n for n in model_names
            if os.path.splitext(n)[1].lower() in (".pth", ".safetensors", ".pt", ".ckpt")
        ]
        model_names = sorted(model_names)
        if not model_names:
            model_names = [f"(place models in: {folder_paths.get_folder_paths(_LATENT_UPSCALE_FOLDER)[0]})"]
        return {
            "required": {
                "model_name": (model_names,),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("model_name",)
    FUNCTION = "select_name"
    CATEGORY = "Practical-Tools/loaders"
    OUTPUT_NODE = False

    def select_name(self, model_name):
        return (model_name,)


NODE_CLASS_MAPPINGS = {
    "wcx_LatentUpscaleModelNameSelector": wcx_LatentUpscaleModelNameSelector,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_LatentUpscaleModelNameSelector": "Latent Upscale Model Name Selector",
}
