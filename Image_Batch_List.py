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

        image1 = 图像[0]
        if image1.ndim == 3:
            image1 = image1.unsqueeze(0)

        for image2 in 图像[1:]:
            if image2.ndim == 3:
                image2 = image2.unsqueeze(0)

            if image2.device != image1.device:
                image2 = image2.to(image1.device)

            H, W = image1.shape[1], image1.shape[2]
            if image2.shape[1] != H or image2.shape[2] != W:
                image2 = comfy.utils.common_upscale(
                    image2.movedim(-1, 1),
                    W,
                    H,
                    "lanczos",
                    "center"
                ).movedim(1, -1)

            if image2.shape[3] != image1.shape[3]:
                min_C = min(image1.shape[3], image2.shape[3])
                image1 = image1[:, :, :, :min_C]
                image2 = image2[:, :, :, :min_C]

            image1 = torch.cat((image1, image2), dim=0)

        return (image1,)


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