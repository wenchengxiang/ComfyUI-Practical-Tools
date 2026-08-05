import os
import re
import torch
import numpy as np
import comfy
from PIL import Image, ImageOps

# 尝试支持 JXL 格式
try:
    import pillow_jxl  # noqa: F401
    jxl = True
except ImportError:
    jxl = False

# 排序方式定义
sort_methods = [
    "None",
    "Alphabetical (ASC)",
    "Alphabetical (DESC)",
    "Numerical (ASC)",
    "Numerical (DESC)",
    "Datetime (ASC)",
    "Datetime (DESC)"
]

def extract_first_number(s):
    match = re.search(r'\d+', s)
    return int(match.group()) if match else float('inf')

def sort_by(items, base_path='.', method=None):
    def fullpath(x): return os.path.join(base_path, x)

    def get_timestamp(path):
        try:
            return os.path.getmtime(path)
        except FileNotFoundError:
            return float('-inf')

    if method == "Alphabetical (ASC)":
        return sorted(items)
    elif method == "Alphabetical (DESC)":
        return sorted(items, reverse=True)
    elif method == "Numerical (ASC)":
        return sorted(items, key=lambda x: extract_first_number(os.path.splitext(x)[0]))
    elif method == "Numerical (DESC)":
        return sorted(items, key=lambda x: extract_first_number(os.path.splitext(x)[0]), reverse=True)
    elif method == "Datetime (ASC)":
        return sorted(items, key=lambda x: get_timestamp(fullpath(x)))
    elif method == "Datetime (DESC)":
        return sorted(items, key=lambda x: get_timestamp(fullpath(x)), reverse=True)
    else:
        return items


class wcx_LoadImagesFromDirBatch:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "directory": ("STRING", {"default": ""}),
            },
            "optional": {
                "image_load_cap": ("INT", {"default": 0, "min": 0, "step": 1}),
                "start_index": ("INT", {"default": 0, "min": -1, "max": 0xffffffffffffffff, "step": 1}),
                "load_always": ("BOOLEAN", {"default": False, "label_on": "enabled", "label_off": "disabled"}),
                "sort_method": (sort_methods,),
            }
        }

    RETURN_TYPES = ("IMAGE", "MASK", "INT")
    FUNCTION = "load_images"
    CATEGORY = "WCXnodes/Image"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        if 'load_always' in kwargs and kwargs['load_always']:
            return float("NaN")
        else:
            return hash(frozenset(kwargs))

    def load_images(self, directory: str, image_load_cap: int = 0, start_index: int = 0, load_always=False, sort_method=None):
        if not os.path.isdir(directory):
            raise FileNotFoundError(f"Directory '{directory}' cannot be found.")
        dir_files = os.listdir(directory)
        if len(dir_files) == 0:
            raise FileNotFoundError(f"No files in directory '{directory}'.")

        # 过滤支持的图像格式扩展名
        valid_extensions = ['.jpg', '.jpeg', '.png', '.webp']
        if jxl:
            valid_extensions.extend(['.jxl'])
        dir_files = [f for f in dir_files if any(f.lower().endswith(ext) for ext in valid_extensions)]

        dir_files = sort_by(dir_files, directory, sort_method)
        dir_files = [os.path.join(directory, x) for x in dir_files]

        # 从起始索引截取
        dir_files = dir_files[start_index:]

        images = []
        masks = []
        limit_images = image_load_cap > 0
        image_count = 0
        has_non_empty_mask = False

        for image_path in dir_files:
            if os.path.isdir(image_path):
                continue
            if limit_images and image_count >= image_load_cap:
                break
            
            try:
                i = Image.open(image_path)
                i = ImageOps.exif_transpose(i)
                image = i.convert("RGB")
                image = np.array(image).astype(np.float32) / 255.0
                image = torch.from_numpy(image)[None,]
                
                if 'A' in i.getbands():
                    mask = np.array(i.getchannel('A')).astype(np.float32) / 255.0
                    mask = 1. - torch.from_numpy(mask)
                    has_non_empty_mask = True
                else:
                    mask = torch.zeros((64, 64), dtype=torch.float32, device="cpu")
                    
                images.append(image)
                masks.append(mask)
                image_count += 1
            except Exception as e:
                print(f"[Warning] wcx_LoadImagesFromDirBatch: Failed to load {image_path}, error: {e}")
                continue

        if len(images) == 0:
            raise FileNotFoundError(f"No valid images loaded from '{directory}'.")

        if len(images) == 1:
            return (images[0], masks[0], 1)

        elif len(images) > 1:
            image1 = images[0]
            mask1 = None

            # 统一批次内的图像分辨率（基于第一张图进行双线性缩放）
            for image2 in images[1:]:
                if image1.shape[1:] != image2.shape[1:]:
                    image2 = comfy.utils.common_upscale(
                        image2.movedim(-1, 1), image1.shape[2], image1.shape[1], "bilinear", "center"
                    ).movedim(1, -1)
                image1 = torch.cat((image1, image2), dim=0)

            # 统一批次内的 Mask 分辨率
            for mask2 in masks:
                if has_non_empty_mask:
                    if image1.shape[1:3] != mask2.shape:
                        mask2 = torch.nn.functional.interpolate(
                            mask2.unsqueeze(0).unsqueeze(0), size=(image1.shape[1], image1.shape[2]), mode='bilinear', align_corners=False
                        )
                        mask2 = mask2.squeeze(0)
                    else:
                        mask2 = mask2.unsqueeze(0)
                else:
                    # 如果全是空白mask，生成与第一张图匹配的零张量
                    mask2 = torch.zeros((image1.shape[1], image1.shape[2]), dtype=torch.float32, device="cpu").unsqueeze(0)

                if mask1 is None:
                    mask1 = mask2
                else:
                    mask1 = torch.cat((mask1, mask2), dim=0)

            return (image1, mask1, len(images))


# 映射节点到ComfyUI界面
NODE_CLASS_MAPPINGS = {
    "wcx_LoadImagesFromDirBatch": wcx_LoadImagesFromDirBatch
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_LoadImagesFromDirBatch": "Load Image Batch From Dir"
}