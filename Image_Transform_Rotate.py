# =====================================================================
# 100% 独立且零外部依赖的图像旋转节点 (ImageTransformRotate)
# 命名与注册完全对齐 wcx 自定义插件规范，已彻底剥离所有自定义转换方法与外部依赖
# =====================================================================

import torch
import numpy as np
from PIL import Image

# 1. 独立兼容底层采样器选择器
def get_sampler_by_name(name):
    if name == "lanczos":
        return Image.Resampling.LANCZOS
    elif name == "bicubic":
        return Image.Resampling.BICUBIC
    elif name == "hamming":
        return Image.Resampling.HAMMING
    elif name == "bilinear":
        return Image.Resampling.BILINEAR
    elif name == "box":
        return Image.Resampling.BOX
    elif name == "nearest":
        return Image.Resampling.NEAREST
    else:
        return Image.Resampling.BICUBIC

# 2. 替代原本 tensor.tensor_to_image() 的标准转换函数
def comfy_tensor_to_pil(tensor):
    # ComfyUI 图像张量标准格式为 [H, W, C]，范围 0.0 ~ 1.0
    numpy_image = (tensor.cpu().numpy() * 255.0).clip(0, 255).astype(np.uint8)
    return Image.fromarray(numpy_image)

# 3. 替代原本 image.image_to_tensor() 的标准转换函数
def pil_to_comfy_tensor(pil_img):
    numpy_output = np.array(pil_img).astype(np.float32) / 255.0
    return torch.from_numpy(numpy_output)


class ImageTransformRotate:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
                "angle": ("FLOAT", {
                    "default": 35.0,
                    "max": 360.0,
                    "step": 0.1
                }),
                "expand": (["true", "false"],),
                "SSAA": ("INT", {
                    "default": 4,
                    "min": 1,
                    "max": 16,
                    "step": 1
                }),
                "method": (["lanczos", "bicubic", "hamming", "bilinear", "box", "nearest"],),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "node"
    CATEGORY = "Practical-Tools/Image"  # 归入统一的自定义路径

    def node(self, images, angle, expand, SSAA, method):
        height, width = images[0, :, :, 0].shape

        def rotate_tensor(tensor):
            if method == "lanczos":
                resize_sampler = Image.Resampling.LANCZOS
                rotate_sampler = Image.Resampling.BICUBIC
            elif method == "bicubic":
                resize_sampler = Image.Resampling.BICUBIC
                rotate_sampler = Image.Resampling.BICUBIC
            elif method == "hamming":
                resize_sampler = Image.Resampling.HAMMING
                rotate_sampler = Image.Resampling.BILINEAR
            elif method == "bilinear":
                resize_sampler = Image.Resampling.BILINEAR
                rotate_sampler = Image.Resampling.BILINEAR
            elif method == "box":
                resize_sampler = Image.Resampling.BOX
                rotate_sampler = Image.Resampling.NEAREST
            elif method == "nearest":
                resize_sampler = Image.Resampling.NEAREST
                rotate_sampler = Image.Resampling.NEAREST
            else:
                raise ValueError()

            if SSAA > 1:
                # 使用标准转换函数，安全且兼容任何环境
                img = comfy_tensor_to_pil(tensor)
                img_us_scaled = img.resize((width * SSAA, height * SSAA), resize_sampler)
                img_rotated = img_us_scaled.rotate(angle, rotate_sampler, expand == "true", fillcolor=(0, 0, 0, 0))
                img_down_scaled = img_rotated.resize((img_rotated.width // SSAA, img_rotated.height // SSAA), resize_sampler)
                result = pil_to_comfy_tensor(img_down_scaled)
            else:
                img = comfy_tensor_to_pil(tensor)
                img_rotated = img.rotate(angle, rotate_sampler, expand == "true", fillcolor=(0, 0, 0, 0))
                result = pil_to_comfy_tensor(img_rotated)

            return result

        if angle == 0.0 or angle == 360.0:
            return (images,)
        else:
            return (torch.stack([
                rotate_tensor(images[i]) for i in range(len(images))
            ]),)

# =====================================================================
# 核心规范：节点注册映射字典（类映射键名严格加 wcx_ 前缀，展示名对齐）
# =====================================================================
NODE_CLASS_MAPPINGS = {
    "wcx_ImageTransformRotate": ImageTransformRotate
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_ImageTransformRotate": "Image Transform Rotate"
}