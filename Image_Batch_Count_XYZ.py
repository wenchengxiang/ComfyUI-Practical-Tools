import torch

class ImageBatchCountXYZ:
    def __init__(self):
        pass
    
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "images": ("IMAGE",),  # 输入的批次图像 [B, H, W, C]
                "threshold": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01}), # 黑白判定的阈值
            },
        }

    RETURN_TYPES = ("INT", "INT", "INT")
    RETURN_NAMES = ("x_black", "y_white", "z_black")
    FUNCTION = "count_images"
    CATEGORY = "Practical-Tools/Image"

    def count_images(self, images, threshold):
        # 获取批次大小
        batch_size = images.shape[0]
        
        # 【优化】只取前3个通道(RGB)，防止RGBA的A通道干扰均值计算
        rgb_images = images[:, :, :, :3]
        
        # 1. 计算每张图的平均亮度（结果在 0.0~1.0 之间）
        mean_brightness = torch.mean(rgb_images, dim=[1, 2, 3])
        
        # 2. 将整个批次转化为布尔序列：True代表白，False代表黑
        is_white_sequence = [bool(val.item() >= threshold) for val in mean_brightness]
        
        # 特殊情况：全黑
        if not any(is_white_sequence):
            return (0, 0, 0)
            
        # 特殊情况：全白
        if all(is_white_sequence):
            return (0, batch_size, 0)

        # 3. 寻找白色区间的边界（第一张白图和最后一张白图的索引）
        first_white_idx = -1
        last_white_idx = -1
        
        for i, is_white in enumerate(is_white_sequence):
            if is_white:
                if first_white_idx == -1:
                    first_white_idx = i
                last_white_idx = i

        # 4. 根据边界索引直接计算出 x, y, z
        x = first_white_idx
        y = last_white_idx - first_white_idx + 1
        z = batch_size - 1 - last_white_idx

        # 5. 适配你的特殊边缘规则
        # 如果是 0黑 + y白 + z黑
        if x == 0 and z > 0:
            return (0, y, z)
            
        # 如果是 x黑 + y白 + 0黑
        elif x > 0 and z == 0:
            return (x, y, 0)

        return (x, y, z)

# 暴露接口
NODE_CLASS_MAPPINGS = {
    "wcx_ImageBatchCountXYZ": ImageBatchCountXYZ
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_ImageBatchCountXYZ": "Image Batch Count XYZ"
}