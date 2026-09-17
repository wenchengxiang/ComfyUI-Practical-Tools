import torch
import re


def parse_color_string(color_str):
    """复制原代码中 string_to_color 的简易实现（支持RGB数字、十六进制、颜色名）"""
    color_str = color_str.strip()
    parts = re.split(r'[,\s]+', color_str)
    if len(parts) == 3:
        try:
            vals = [float(p) for p in parts]
            if all(v > 1 for v in vals):
                vals = [int(v) for v in vals]
            else:
                vals = [int(v * 255) for v in vals]
            return vals
        except ValueError:
            pass
    color_map = {
        "black": [0, 0, 0],
        "white": [255, 255, 255],
        "red": [255, 0, 0],
        "green": [0, 255, 0],
        "blue": [0, 0, 255],
        "gray": [128, 128, 128],
        "grey": [128, 128, 128],
    }
    if color_str.lower() in color_map:
        return color_map[color_str.lower()]
    if re.match(r'^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$', color_str):
        h = color_str.lstrip('#')
        if len(h) == 3:
            h = ''.join([c*2 for c in h])
        return [int(h[i:i+2], 16) for i in (0, 2, 4)]
    return [0, 0, 0]


class ImagePad:
    NAME = "Image Pad"
    CATEGORY = "Practical-Tools/Image"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "left": ("INT", {"default": 0, "min": 0, "max": 4096, "step": 1}),
                "right": ("INT", {"default": 0, "min": 0, "max": 4096, "step": 1}),
                "top": ("INT", {"default": 0, "min": 0, "max": 4096, "step": 1}),
                "bottom": ("INT", {"default": 0, "min": 0, "max": 4096, "step": 1}),
                "color": ("STRING", {"default": "0, 0, 0", "multiline": False}),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "pad"

    def pad(self, image, left, right, top, bottom, color):
        B, H, W, C = image.shape

        # 解析颜色（完全复制原代码逻辑，假定RGB）
        rgb_vals = parse_color_string(color)
        if len(rgb_vals) == 1:
            rgb_vals = rgb_vals * 3
        elif len(rgb_vals) != 3:
            rgb_vals = [0, 0, 0]
        bg_color = [v / 255.0 for v in rgb_vals]
        bg_color = torch.tensor(bg_color, dtype=image.dtype, device=image.device)  # shape [3]

        # 计算新尺寸
        new_H = H + top + bottom
        new_W = W + left + right

        # 创建输出图像（全零）
        out_image = torch.zeros((B, new_H, new_W, C), dtype=image.dtype, device=image.device)

        # 填充背景色（广播到整个图像）
        # 原代码中是 for b in range(B): out_image[b, :, :, :] = bg_color.unsqueeze(0).unsqueeze(0)
        # 我们直接广播：out_image[:] = bg_color.view(1, 1, 1, 3) 或 view(1,1,1,3)
        out_image[:] = bg_color.view(1, 1, 1, 3)

        # 放置原图
        out_image[:, top:top+H, left:left+W, :] = image

        return (out_image,)


# 注册映射
NODE_CLASS_MAPPINGS = {
    "wcx_ImagePad": ImagePad,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_ImagePad": "Image Pad",
}