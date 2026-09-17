import torch
import copy
from PIL import Image
import numpy as np


# ---------- 辅助函数（内联，支持多种形状） ----------
def pil2tensor(image):
    if image.mode == 'L':
        arr = np.array(image, dtype=np.float32) / 255.0
        arr = np.expand_dims(arr, axis=-1)
    else:
        arr = np.array(image, dtype=np.float32) / 255.0
    return torch.from_numpy(arr).unsqueeze(0)


def tensor2pil(tensor):
    if tensor.dim() == 4:
        tensor = tensor.squeeze(0)
    arr = tensor.cpu().numpy()
    if arr.ndim == 3 and arr.shape[0] == 1:
        arr = arr.squeeze(0)
    elif arr.ndim == 3 and arr.shape[-1] == 1:
        arr = arr.squeeze(-1)
    arr = (arr * 255).clip(0, 255).astype(np.uint8)
    if arr.ndim == 2:
        return Image.fromarray(arr, 'L')
    elif arr.ndim == 3 and arr.shape[-1] == 3:
        return Image.fromarray(arr, 'RGB')
    elif arr.ndim == 3 and arr.shape[-1] == 4:
        return Image.fromarray(arr, 'RGBA')
    else:
        raise ValueError(f"Unsupported shape: {arr.shape}")


def image2mask(image):
    if image.mode != 'L':
        image = image.convert('L')
    arr = np.array(image, dtype=np.float32) / 255.0
    return torch.from_numpy(arr).unsqueeze(0)


# ---------- 节点主类 ----------
class ImageBlend:
    NAME = "Image Blend"
    CATEGORY = "Practical-Tools/Image"

    @classmethod
    def INPUT_TYPES(self):
        method_mode = ['lanczos', 'bicubic', 'hamming', 'bilinear', 'box', 'nearest']
        return {
            "required": {
                "background_image": ("IMAGE",),
                "layer_image": ("IMAGE",),
                "x_percent": ("FLOAT", {"default": 50, "min": -999, "max": 999, "step": 0.01}),
                "y_percent": ("FLOAT", {"default": 50, "min": -999, "max": 999, "step": 0.01}),
                "scale": ("FLOAT", {"default": 1, "min": 0.01, "max": 100, "step": 0.01}),
                "rotate": ("FLOAT", {"default": 0, "min": -360, "max": 360, "step": 0.1}),
                "opacity": ("INT", {"default": 100, "min": 0, "max": 100, "step": 1}),
                "transform_method": (method_mode,),
            },
            "optional": {
                "layer_mask": ("MASK",),
            }
        }

    RETURN_TYPES = ("IMAGE", "MASK")
    RETURN_NAMES = ("image", "mask")
    FUNCTION = "image_blend"

    def image_blend(self, background_image, layer_image,
                    x_percent, y_percent, scale, rotate, opacity, transform_method,
                    layer_mask=None):
        b_images = []
        l_images = []
        l_masks = []
        ret_images = []
        ret_masks = []

        for b in background_image:
            b_images.append(torch.unsqueeze(b, 0))
        for l in layer_image:
            l_images.append(torch.unsqueeze(l, 0))
            m = tensor2pil(l)
            if m.mode == 'RGBA':
                l_masks.append(m.split()[-1])
            else:
                l_masks.append(Image.new('L', m.size, 'white'))

        if layer_mask is not None:
            if layer_mask.dim() == 2:
                layer_mask = torch.unsqueeze(layer_mask, 0)
            l_masks = []
            for m in layer_mask:
                pil_mask = tensor2pil(m.unsqueeze(0) if m.dim() == 2 else m).convert('L')
                l_masks.append(pil_mask)

        max_batch = max(len(b_images), len(l_images), len(l_masks))
        for i in range(max_batch):
            background_image = b_images[i] if i < len(b_images) else b_images[-1]
            layer_image = l_images[i] if i < len(l_images) else l_images[-1]
            _mask = l_masks[i] if i < len(l_masks) else l_masks[-1]

            _canvas = tensor2pil(background_image).convert('RGB')
            _layer = tensor2pil(layer_image)

            if _mask.size != _layer.size:
                _mask = Image.new('L', _layer.size, 'white')

            orig_layer_width = _layer.width
            orig_layer_height = _layer.height
            _mask = _mask.convert("RGB")

            target_layer_width = int(orig_layer_width * scale)
            target_layer_height = int(orig_layer_height * scale)
            _layer = _layer.resize((target_layer_width, target_layer_height), resample=Image.LANCZOS)
            _mask = _mask.resize((target_layer_width, target_layer_height), resample=Image.LANCZOS)

            if rotate != 0:
                _layer = _layer.rotate(rotate, expand=True, resample=Image.BICUBIC)
                _mask = _mask.rotate(rotate, expand=True, resample=Image.BICUBIC)

            x = int(_canvas.width * x_percent / 100 - _layer.width / 2)
            y = int(_canvas.height * y_percent / 100 - _layer.height / 2)

            # 合成图层（仅放置图层，不混合）
            _comp = copy.copy(_canvas)
            _comp.paste(_layer, (x, y))

            # 生成掩码（用于混合）
            _compmask = Image.new("RGB", _comp.size, color='black')
            _compmask.paste(_mask, (x, y))
            _compmask = _compmask.convert('L')  # 灰度掩码

            # 应用不透明度：调整掩码亮度
            if opacity < 100:
                factor = opacity / 100.0
                _compmask = _compmask.point(lambda p: int(p * factor))

            # 使用 composite 混合，图层区域受掩码控制，其余部分保持背景
            _canvas = Image.composite(_comp, _canvas, _compmask)

            ret_images.append(pil2tensor(_canvas))
            ret_masks.append(image2mask(_compmask))

        return (torch.cat(ret_images, dim=0), torch.cat(ret_masks, dim=0),)


# ---------- 注册映射 ----------
NODE_CLASS_MAPPINGS = {
    "wcx_ImageBlend": ImageBlend,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_ImageBlend": "Image Blend",
}