import torch

class MaskFromBatch:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "mask": ("MASK", ),
                # 修改 min 允许输入负数
                "start": ("INT", { "default": 0, "min": -4096, "max": 4096, "step": 1, }),
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

        batch_size = mask.shape[0]

        # 处理负数索引（如 -1 转换为 batch_size - 1）
        if start < 0:
            start = batch_size + start

        # 边界防错处理，确保 start 落在合法区间 [0, batch_size - 1] 内
        start = max(0, min(start, batch_size - 1))

        # 限制截取长度不超出剩余可用数量
        length = min(batch_size - start, length)

        return (mask[start:start + length], )

# 节点注册
NODE_CLASS_MAPPINGS = {
    "wcx_MaskFromBatch": MaskFromBatch
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_MaskFromBatch": "Mask From Batch"
}