import torch
import comfy.utils

# 纯净版 make_3d_mask 逻辑实现，完全零外部依赖
def make_3d_mask(mask):
    if len(mask.shape) == 2:
        return mask.unsqueeze(0)
    return mask


class wcx_MaskBatchToMaskList:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "optional": {
                "遮罩": ("MASK",),  # 像素级还原原版变量：masks -> 遮罩
            }
        }

    RETURN_TYPES = ("MASK",)
    RETURN_NAMES = ("遮罩",)
    OUTPUT_IS_LIST = (True,)
    FUNCTION = "doit"
    CATEGORY = "Practical-Tools/Mask"

    # 1:1 还原原版形参 doit(self, masks) 逻辑，不做多余的形参默认值改动
    def doit(self, 遮罩):
        if 遮罩 is None:
            empty_mask = torch.zeros((64, 64), dtype=torch.float32, device="cpu")
            return ([empty_mask], )

        res = []
        for mask in 遮罩:
            res.append(mask)

        res = [make_3d_mask(x) for x in res]
        return (res, )


class wcx_MaskListToMaskBatch:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "遮罩": ("MASK",),  # 像素级还原原版变量：mask -> 遮罩
            }
        }

    INPUT_IS_LIST = True
    RETURN_TYPES = ("MASK",)
    RETURN_NAMES = ("遮罩",)
    FUNCTION = "doit"
    CATEGORY = "Practical-Tools/Mask"

    def doit(self, 遮罩):
        if len(遮罩) == 0:
            empty_mask = torch.zeros((1, 64, 64), dtype=torch.float32, device="cpu").unsqueeze(0)
            return (empty_mask,)

        masks_3d = [make_3d_mask(m) for m in 遮罩]
        target_shape = masks_3d[0].shape[1:]
        upscaled_masks = []
        
        for m in masks_3d:
            if m.shape[1:] != target_shape:
                m = m.unsqueeze(1).repeat(1, 3, 1, 1)
                m = comfy.utils.common_upscale(m, target_shape[1], target_shape[0], "lanczos", "center")
                m = m[:, 0, :, :]
            upscaled_masks.append(m)
            
        result = torch.cat(upscaled_masks, dim=0)
        return (result,)


# ==========================================
# 注册与显示名称
# ==========================================
NODE_CLASS_MAPPINGS = {
    "wcx_MaskBatchToMaskList": wcx_MaskBatchToMaskList,
    "wcx_MaskListToMaskBatch": wcx_MaskListToMaskBatch
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_MaskBatchToMaskList": "Mask Batch to Mask List",
    "wcx_MaskListToMaskBatch": "Mask List to Mask Batch"
}