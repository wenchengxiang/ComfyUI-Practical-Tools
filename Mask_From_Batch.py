import torch

class MaskFromBatch:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "mask": ("MASK", ),
                "start": ("INT", { "default": 0, "min": 0, "step": 1, }),
                "length": ("INT", { "default": 1, "min": 1, "step": 1, }),
            }
        }

    RETURN_TYPES = ("MASK",)
    RETURN_NAMES = ("MASK",)
    FUNCTION = "execute"
    CATEGORY = "Practical-Tools/Mask"  # 匹配你的节点包分类

    def execute(self, mask, start, length):
        # 兼容处理非 Batch 的单张 Mask
        if mask.dim() == 2:
            mask = mask.unsqueeze(0)

        if length > mask.shape[0]:
            length = mask.shape[0]

        start = min(start, mask.shape[0]-1)
        length = min(mask.shape[0]-start, length)
        return (mask[start:start + length], )

# 节点注册
NODE_CLASS_MAPPINGS = {
    "wcx_MaskFromBatch": MaskFromBatch
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_MaskFromBatch": "Mask From Batch"
}