import torch

class ImageBlendMaskCenter:
    def __init__(self):
        pass
    
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "destination": ("IMAGE",),
                "source": ("IMAGE",),
                "mask": ("MASK",),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("IMAGE",)
    FUNCTION = "blend_by_center"
    CATEGORY = "Practical-Tools/Image"

    def blend_by_center(self, destination, source, mask):
        # 1. 输入预处理：统一转为 Tensor
        if isinstance(destination, list): destination = torch.stack(destination)
        if isinstance(source, list): source = torch.stack(source)
        if isinstance(mask, list): mask = torch.stack(mask)
        
        # 确保 Mask 维度为 (B, H, W)
        if mask.ndim == 4: mask = mask.squeeze(-1)
        if mask.ndim == 2: mask = mask.unsqueeze(0)
            
        # 2. 对齐 Batch 数量
        max_batch = max(destination.shape[0], source.shape[0], mask.shape[0])
        
        def align_batch(tensor, target_batch):
            curr_batch = tensor.shape[0]
            if curr_batch < target_batch:
                # 使用 expand 或 repeat 补齐
                repeats = [1] * tensor.ndim
                repeats[0] = target_batch // curr_batch
                return tensor.repeat(*repeats)
            return tensor

        destination = align_batch(destination, max_batch)
        source = align_batch(source, max_batch)
        mask = align_batch(mask, max_batch)

        # 3. 初始化输出
        output = destination.clone()
        batch_size = output.shape[0]
        dest_h, dest_w = destination.shape[1], destination.shape[2]
        src_h, src_w = source.shape[1], source.shape[2]
        
        # 4. 循环处理
        for i in range(batch_size):
            current_mask = mask[i]
            non_zero_indices = torch.nonzero(current_mask)
            
            if non_zero_indices.shape[0] == 0:
                center_x, center_y = dest_w / 2.0, dest_h / 2.0
            else:
                y_indices = non_zero_indices[:, 0].float()
                x_indices = non_zero_indices[:, 1].float()
                center_x = ((x_indices.min() + x_indices.max()) / 2.0).item()
                center_y = ((y_indices.min() + y_indices.max()) / 2.0).item()
                
            # 计算起始坐标
            start_x = int(round(center_x - (src_w / 2.0)))
            start_y = int(round(center_y - (src_h / 2.0)))
            
            # 磁吸边界处理
            if src_w >= dest_w:
                start_x = (dest_w - src_w) // 2
            else:
                start_x = max(0, min(start_x, dest_w - src_w))
                
            if src_h >= dest_h:
                start_y = (dest_h - src_h) // 2
            else:
                start_y = max(0, min(start_y, dest_h - src_h))
            
            # 安全区域切片
            dest_x_start, dest_y_start = max(0, start_x), max(0, start_y)
            dest_x_end, dest_y_end = min(dest_w, start_x + src_w), min(dest_h, start_y + src_h)
            
            src_x_start = max(0, -start_x)
            src_y_start = max(0, -start_y)
            src_x_end = src_x_start + (dest_x_end - dest_x_start)
            src_y_end = src_y_start + (dest_y_end - dest_y_start)
            
            # 执行贴回
            if (dest_x_end > dest_x_start) and (dest_y_end > dest_y_start):
                output[i, dest_y_start:dest_y_end, dest_x_start:dest_x_end, :] = \
                    source[i, src_y_start:src_y_end, src_x_start:src_x_end, :]
                    
        return (output,)

NODE_CLASS_MAPPINGS = { "wcx_ImageBlendMaskCenter": ImageBlendMaskCenter }
NODE_DISPLAY_NAME_MAPPINGS = { "wcx_ImageBlendMaskCenter": "Image Blend Mask Center" }