import torch

class ImageBatchInterleaveSplit:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "images": ("IMAGE",),
                "n_groups": ("INT", {"default": 3, "min": 1, "max": 1000, "step": 1}),
            }
        }

    # 注意：这里类型仍然写 "IMAGE"，但我们在下面通过特殊的 OUTPUT_IS_LIST 声明它是一个列表
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image_batch_list",)
    # 关键：告诉 ComfyUI 这个端口输出的是一个 List（列表），后续节点会循环接收它
    OUTPUT_IS_LIST = (True,) 
    
    FUNCTION = "reorder_and_split_batch"
    CATEGORY = "Practical-Tools/Image"

    def reorder_and_split_batch(self, images, n_groups):
        total_images = images.shape[0]
        
        # 边界情况处理
        if n_groups <= 1:
            # 如果只有1组，那每组取一张就相当于把原 Batch 拆成单张图片的列表
            return ([img.unsqueeze(0) for img in images],)
            
        # 安全检查：确保总图片数能被 n_groups 整除
        if total_images % n_groups != 0:
            per_group = total_images // n_groups
            valid_total = per_group * n_groups
            print(f"[Warning] ImageBatchInterleaveSplit: Total images ({total_images}) is not divisible by n_groups ({n_groups}). "
                  f"Truncating to {valid_total} images.")
            images = images[:valid_total]
            total_images = valid_total
        
        per_group = total_images // n_groups
        
        # 1. 改变维度，将图像分成 n_groups 组，每组 per_group 张
        # 形状变成: (n_groups, per_group, H, W, C)
        reshaped = images.view(n_groups, per_group, *images.shape[1:])
        
        # 2. 交换维度，把每组的“第张几”提到最前面
        # 形状变成: (per_group, n_groups, H, W, C)
        transposed = reshaped.permute(1, 0, *range(2, len(reshaped.shape)))
        
        # 3. 核心修改：不再 reshape 回一个大张量，而是切分成一个列表
        # transposed[i] 的形状是 (n_groups, H, W, C)，正好是一个包含 n_groups 张图的 Batch
        output_list = []
        for i in range(per_group):
            # 提取出当前轮次的 batch 并保持 4D 张量形状
            current_batch = transposed[i] 
            output_list.append(current_batch)
            
        # 返回一个元组，里面的第一个元素是我们的图像 Batch 列表
        return (output_list,)

# 映射节点到ComfyUI界面
NODE_CLASS_MAPPINGS = {
    "wcx_ImageBatchInterleaveSplit": ImageBatchInterleaveSplit
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_ImageBatchInterleaveSplit": "Image Batch Interleave Split"
}