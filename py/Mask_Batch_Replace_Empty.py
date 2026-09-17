import torch

class MaskBatchReplaceEmpty:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "masks": ("MASK",),  # 输入的批次遮罩
            },
        }

    RETURN_TYPES = ("MASK",)
    FUNCTION = "replace_empty_masks"
    CATEGORY = "Practical-Tools/Mask"

    def replace_empty_masks(self, masks):
        if not isinstance(masks, torch.Tensor):
            return (masks,)

        # 复制一份避免修改原数据
        output_masks = masks.clone()
        batch_size = output_masks.shape[0]
        
        # ---------------------------------------------------------
        # 第一步：向后遍历，寻找整个批次里的第一个非纯黑遮罩
        # ---------------------------------------------------------
        first_valid_mask = None
        for i in range(batch_size):
            # 使用均值判断，容忍极微小的压缩噪点，比单看 == 0 更安全
            if torch.mean(output_masks[i].float()) > 0.001:
                first_valid_mask = output_masks[i]
                break
        
        # 如果整个批次全都是纯黑，则无法替换，直接原样返回
        if first_valid_mask is None:
            return (output_masks,)
            
        # ---------------------------------------------------------
        # 第二步：核心双向替换逻辑
        # ---------------------------------------------------------
        # 初始化“最近一个有效遮罩”，默认使用找到的第一个非黑遮罩
        # 这样开头若有连续纯黑，就会自动被它覆盖（满足你的特殊边界要求）
        last_valid_mask = first_valid_mask

        for i in range(batch_size):
            # 同样使用均值阈值判断当前遮罩是否为“纯黑”
            if torch.mean(output_masks[i].float()) <= 0.001:
                # 替换为最近的有效遮罩（保持形状一致）
                output_masks[i] = last_valid_mask
            else:
                # 遇到真正的有效遮罩，更新它，供后面的纯黑遮罩使用
                last_valid_mask = output_masks[i]

        return (output_masks,)

# 节点注册映射
NODE_CLASS_MAPPINGS = {
    "wcx_MaskBatchReplaceEmpty": MaskBatchReplaceEmpty
}

# 节点在 UI 上的显示名称
NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_MaskBatchReplaceEmpty": "Mask Batch Replace Empty"
}