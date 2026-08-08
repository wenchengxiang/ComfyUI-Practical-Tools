import numpy as np
import torch
from PIL import Image, ImageOps
from scipy.ndimage import binary_fill_holes

# ==========================================
# 内部辅助转换工具（确保不污染全局命名空间）
# ==========================================
def _mask2pil(mask):
    if mask.ndim > 2:
        mask = mask.squeeze(0)
    mask_np = mask.cpu().numpy().astype('uint8')
    if mask_np.max() <= 1.0:
        mask_np = (mask_np * 255).astype('uint8')
    return Image.fromarray(mask_np, mode="L")

def _pil2mask(image):
    image_np = np.array(image.convert("L")).astype(np.float32) / 255.0
    return 1.0 - torch.from_numpy(image_np)


class wcx_MaskFillHoles:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "遮罩": ("MASK",),  # 中文输入命名，直观友好
            }
        }

    RETURN_TYPES = ("MASK",)
    RETURN_NAMES = ("遮罩",)       # 保持中英文输出命名习惯的一致性
    FUNCTION = "fill_holes"
    CATEGORY = "Practical-Tools/Mask"     # 统一归入 WCX 节点树下的 mask 分类

    def fill_holes(self, 遮罩):
        # 针对单张 MASK 或 MASK 批处理（Batch）进行遍历处理
        if 遮罩.ndim == 3:
            filled_masks = []
            for m in 遮罩:
                filled_masks.append(self.fill_region(_mask2pil(m)))
            
            # 重新打包成 Tensor Batch 返回
            return (torch.cat([_pil2mask(f_m) for f_m in filled_masks], dim=0),)
        else:
            # 单张 Mask 处理
            return (_pil2mask(self.fill_region(_mask2pil(遮罩))),)

    def fill_region(self, image):
        # 核心算法：通过 scipy 的 binary_fill_holes 进行高保真孔洞填充
        image = image.convert("L")
        binary_mask = np.array(image) > 0
        filled_mask = binary_fill_holes(binary_mask)
        filled_image = Image.fromarray(filled_mask.astype(np.uint8) * 255, mode="L")
        # 还原 WAS 经典的遮罩反转逻辑，确保黑白遮罩关系正常
        return ImageOps.invert(filled_image.convert("RGB"))


# ==========================================
# WCX 专属节点注册与显示名称映射
# ==========================================
NODE_CLASS_MAPPINGS = {
    "wcx_MaskFillHoles": wcx_MaskFillHoles
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_MaskFillHoles": "Mask Fill Holes"
}