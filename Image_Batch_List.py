import torch
import comfy.utils

class wcx_ImageBatchToImageList:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "图像": ("IMAGE",),  # 像素级还原原版变量：image -> 图像
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("图像",)
    OUTPUT_IS_LIST = (True,)
    FUNCTION = "doit"
    CATEGORY = "Practical-Tools/Image"

    def doit(self, 图像):
        # 1:1 还原原版：images = [image[i:i + 1, ...] for i in range(image.shape[0])]
        图像列表 = [图像[i:i + 1, ...] for i in range(图像.shape[0])]
        return (图像列表, )


class wcx_ImageListToImageBatch:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "图像": ("IMAGE",),  # 像素级还原原版变量：images -> 图像
            }
        }

    INPUT_IS_LIST = True
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("图像",)
    FUNCTION = "doit"
    CATEGORY = "Practical-Tools/Image"

    def doit(self, 图像):
        if len(图像) == 0:
            return ()
        if len(图像) == 1:
            img = 图像[0]
            if img.ndim == 3:  
                img = img.unsqueeze(0)
            return (img,)

        # ------------------------------------------------------
        # 性能修复：旧写法在循环里逐张 torch.cat((image1, image2))
        # 是 O(n²)，每轮都把前面累积的所有图片重新拷贝一遍。
        # 现改为：先统一尺寸/通道/设备放进列表，最后一次性 cat。
        # 结果与原逻辑完全一致（最终通道数 = 全部图片的最小通道数）。
        # ------------------------------------------------------

        target = 图像[0]
        if target.ndim == 3:
            target = target.unsqueeze(0)

        target_device = target.device
        H, W = target.shape[1], target.shape[2]
        final_C = target.shape[3]

        processed = []

        for image2 in 图像:

            if image2.ndim == 3:
                image2 = image2.unsqueeze(0)

            if image2.device != target_device:
                image2 = image2.to(target_device)

            if image2.shape[1] != H or image2.shape[2] != W:
                image2 = comfy.utils.common_upscale(
                    image2.movedim(-1, 1),
                    W,
                    H,
                    "lanczos",
                    "center"
                ).movedim(1, -1)

            if image2.shape[3] != target.shape[3]:
                final_C = min(final_C, image2.shape[3])

            processed.append(image2)

        # 统一通道数后一次性拼接（含第一张）
        processed = [im[:, :, :, :final_C] for im in processed]

        return (torch.cat(processed, dim=0),)


# ==========================================
# 注册与显示名称
# ==========================================
NODE_CLASS_MAPPINGS = {
    "wcx_ImageBatchToImageList": wcx_ImageBatchToImageList,
    "wcx_ImageListToImageBatch": wcx_ImageListToImageBatch
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_ImageBatchToImageList": "Image Batch to Image List",
    "wcx_ImageListToImageBatch": "Image List to Image Batch"
}
