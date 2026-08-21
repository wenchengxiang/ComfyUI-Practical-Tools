import torch
from torchvision.transforms.functional import gaussian_blur


class MaskBlur:
    NAME = "Mask Blur"
    CATEGORY = "Practical-Tools/Mask"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "mask": ("MASK",),
                "blur": ("INT", {"default": 4, "min": 0, "max": 999, "step": 1}),
            },
        }

    RETURN_TYPES = ("MASK",)
    RETURN_NAMES = ("mask",)
    FUNCTION = "mask_blur"

    def mask_blur(self, mask, blur):
        # 确保 mask 为 4D [B, 1, H, W]
        if mask.dim() == 3:
            mask = mask.unsqueeze(1)
        elif mask.dim() == 2:
            mask = mask.unsqueeze(0).unsqueeze(1)

        # 高斯模糊
        if blur > 0:
            kernel_size = blur * 2 + 1
            sigma = blur / 2.0
            mask = gaussian_blur(mask, kernel_size=[kernel_size, kernel_size], sigma=[sigma, sigma])

        # 移除通道维度，返回 [B, H, W]
        mask = mask.squeeze(1)

        print(f"[Mask Blur] Processed {mask.shape[0]} mask(s).")
        return (mask,)


# 注册映射
NODE_CLASS_MAPPINGS = {
    "wcx_MaskBlur": MaskBlur,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_MaskBlur": "Mask Blur",
}