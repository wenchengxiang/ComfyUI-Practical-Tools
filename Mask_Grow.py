import torch
import torch.nn.functional as F


class MaskGrow:
    NAME = "Mask Grow"
    CATEGORY = "Practical-Tools/Mask"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "mask": ("MASK",),
                "grow": ("INT", {"default": 4, "min": -999, "max": 999, "step": 1}),
            },
        }

    RETURN_TYPES = ("MASK",)
    RETURN_NAMES = ("mask",)
    FUNCTION = "mask_grow"

    def mask_grow(self, mask, grow):
        # 确保 mask 为 4D [B, 1, H, W]
        if mask.dim() == 3:
            mask = mask.unsqueeze(1)
        elif mask.dim() == 2:
            mask = mask.unsqueeze(0).unsqueeze(1)

        # 形态学操作（膨胀/腐蚀）
        if grow != 0:
            kernel_size = abs(grow) * 2 + 1
            padding = kernel_size // 2
            if grow > 0:  # 膨胀：最大池化
                mask = F.max_pool2d(mask, kernel_size, stride=1, padding=padding)
            else:         # 腐蚀：对取反后的图像做膨胀，再取反
                mask = 1.0 - F.max_pool2d(1.0 - mask, kernel_size, stride=1, padding=padding)

        # 移除通道维度，返回 [B, H, W]
        mask = mask.squeeze(1)

        print(f"[Mask Grow] Processed {mask.shape[0]} mask(s).")
        return (mask,)


# 注册映射
NODE_CLASS_MAPPINGS = {
    "wcx_MaskGrow": MaskGrow,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_MaskGrow": "Mask Grow",
}