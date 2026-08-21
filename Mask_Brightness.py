import torch


class MaskBrightness:
    NAME = "Mask Brightness"
    CATEGORY = "Practical-Tools/Mask"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "mask": ("MASK",),
                "brightness": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 2.0, "step": 0.01}),
            }
        }

    RETURN_TYPES = ("MASK",)
    RETURN_NAMES = ("mask",)
    FUNCTION = "adjust"

    def adjust(self, mask, brightness):
        adjusted = mask * brightness
        adjusted = torch.clamp(adjusted, min=0.0, max=1.0)
        return (adjusted,)


# 注册映射
NODE_CLASS_MAPPINGS = {
    "wcx_MaskBrightness": MaskBrightness,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_MaskBrightness": "Mask Brightness",
}