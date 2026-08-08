import torch

class ImageBatchInterleave:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "images": ("IMAGE",),
                "n_groups": ("INT", {"default": 3, "min": 1, "max": 1000, "step": 1}),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "reorder_batch"
    CATEGORY = "Practical-Tools/Image"

    def reorder_batch(self, images, n_groups):
        # 获取当前Batch的图片总数
        total_images = images.shape[0]
        
        # 边界情况处理：如果设为1组，或者只有1张图，直接原样返回
        if n_groups <= 1 or total_images <= 1:
            return (images,)
            
        # 安全检查：确保总图片数能被 n_groups 整除
        if total_images % n_groups != 0:
            # 举例：12张图，传了5组，无法整除。这里采取截断处理，保证程序不崩溃
            per_group = total_images // n_groups
            valid_total = per_group * n_groups
            print(f"[Warning] ImageBatchInterleave: Total images ({total_images}) is not divisible by n_groups ({n_groups}). "
                  f"Truncating to {valid_total} images.")
            images = images[:valid_total]
            total_images = valid_total
        
        # 计算每组应该有多少张图
        per_group = total_images // n_groups
        
        # --- 核心矩阵重排逻辑 ---
        # 1. 假设 inputs 是 [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], n_groups = 3, per_group = 4
        # 2. 首先 view(n_groups, per_group, H, W, C)
        #    变成：
        #    组1: [1, 2, 3, 4]
        #    组2: [5, 6, 7, 8]
        #    组3: [9, 10, 11, 12]
        reshaped = images.view(n_groups, per_group, *images.shape[1:])
        
        # 3. permute(1, 0, ...) 交换前两个维度（转置）
        #    变成：
        #    [ [1, 5, 9],
        #      [2, 6, 10],
        #      [3, 7, 11],
        #      [4, 8, 12] ]
        transposed = reshaped.permute(1, 0, *range(2, len(reshaped.shape)))
        
        # 4. 最后把它展平回原来的 Batch 形状 (total_images, H, W, C)
        #    输出：[1, 5, 9, 2, 6, 10, 3, 7, 11, 4, 8, 12]
        output_images = transposed.reshape(total_images, *images.shape[1:])
        
        return (output_images,)

# 映射节点到ComfyUI界面
NODE_CLASS_MAPPINGS = {
    "wcx_ImageBatchInterleave": ImageBatchInterleave
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_ImageBatchInterleave": "Image Batch Interleave"
}