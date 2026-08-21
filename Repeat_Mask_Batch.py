import torch


class RepeatMaskBatch:
    NAME = "Repeat Mask Batch"
    CATEGORY = "Practical-Tools/mask"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "mask": ("MASK", {}),
                "amount": ("INT", {"default": 1, "min": 1, "max": 4096}),
            }
        }

    RETURN_TYPES = ("MASK",)
    RETURN_NAMES = ("mask",)
    FUNCTION = "repeat"

    def repeat(self, mask: torch.Tensor, amount: int):
        repeat_dims = (amount,) + (1,) * (mask.dim() - 1)
        repeated = mask.repeat(repeat_dims)
        return (repeated,)


# 注册映射
NODE_CLASS_MAPPINGS = {
    "wcx_RepeatMaskBatch": RepeatMaskBatch,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_RepeatMaskBatch": "Repeat Mask Batch",
}