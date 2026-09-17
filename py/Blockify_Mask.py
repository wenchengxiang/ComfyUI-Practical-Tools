import torch


class BlockifyMask:
    NAME = "Blockify Mask"
    CATEGORY = "Practical-Tools/Mask"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "masks": ("MASK",),
                "block_size": ("INT", {"default": 32, "min": 8, "max": 512, "step": 1}),
            },
        }

    RETURN_TYPES = ("MASK",)
    RETURN_NAMES = ("mask",)
    FUNCTION = "process"

    def process(self, masks, block_size):
        # 固定使用 CPU
        device = torch.device("cpu")
        masks = masks.to(device)
        batch_size, height, width = masks.shape

        result_masks = torch.zeros_like(masks)

        for i in range(batch_size):
            mask = masks[i]

            # 寻找非零区域（边界框）
            mask_bool = mask > 0
            if not mask_bool.any():
                continue

            y_indices = torch.nonzero(mask_bool.any(dim=1), as_tuple=True)[0]
            x_indices = torch.nonzero(mask_bool.any(dim=0), as_tuple=True)[0]

            if len(y_indices) == 0 or len(x_indices) == 0:
                continue

            y_min, y_max = y_indices[0], y_indices[-1]
            x_min, x_max = x_indices[0], x_indices[-1]

            bbox_width = x_max - x_min + 1
            bbox_height = y_max - y_min + 1

            # 计算块划分
            w_divisions = max(1, bbox_width // block_size)
            h_divisions = max(1, bbox_height // block_size)

            w_slice = bbox_width // w_divisions
            h_slice = bbox_height // h_divisions

            # 生成坐标网格（仅边界框区域）
            y_coords = torch.arange(y_min, y_max + 1, device=device).view(-1, 1)
            x_coords = torch.arange(x_min, x_max + 1, device=device).view(1, -1)

            # 计算每个像素所属的块索引
            w_block_indices = (x_coords - x_min) // w_slice
            h_block_indices = (y_coords - y_min) // h_slice
            w_block_indices = w_block_indices.clamp(0, w_divisions - 1)
            h_block_indices = h_block_indices.clamp(0, h_divisions - 1)

            block_ids = h_block_indices * w_divisions + w_block_indices

            # 获取边界框内的 mask 区域
            mask_region = mask[y_min:y_max+1, x_min:x_max+1]

            # 统计每个块是否包含非零像素
            max_blocks = h_divisions * w_divisions
            block_content = torch.zeros(max_blocks, device=device)
            block_content.scatter_add_(0, block_ids.flatten(), mask_region.flatten())

            has_content = block_content > 0
            block_mask = has_content[block_ids]

            # 填入结果
            result_masks[i, y_min:y_max+1, x_min:x_max+1] = block_mask.float()

        # 返回裁剪后的结果（确保在 [0,1]）
        return (result_masks.clamp(0, 1),)


# 注册映射
NODE_CLASS_MAPPINGS = {
    "wcx_BlockifyMask": BlockifyMask,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_BlockifyMask": "Blockify Mask",
}