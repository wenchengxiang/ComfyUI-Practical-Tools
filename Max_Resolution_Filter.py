import torch

class MaxResolutionFilter:
    def __init__(self):
        pass
    
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                # 关键修复：
                # 1. 类型设为 "*"（通配符），无论上游是大写 IMAGE、小写 image 还是带列表属性的张量，百分之百能连上不报错。
                # 2. 通过 raw_type 提示前端，给它套上小写 "image" 的皮肤，从而在画布上完美显示为“九宫格列表图标”。
                "image_list": ("*", {"forceInput": True, "raw_type": "image"}), 
            },
        }

    # 声明此节点内部处理列表
    INPUT_IS_LIST = True

    # 输出保持标准大写 "IMAGE"，确保下游节点连线顺畅
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("IMAGE",)
    FUNCTION = "filter_max_resolution"
    CATEGORY = "Practical-Tools/Image"

    def filter_max_resolution(self, image_list):
        if not image_list or len(image_list) == 0:
            raise ValueError("输入的图像列表为空！")

        max_pixels = -1
        best_img = None

        # 兼容处理：有时候上游传过来的列表会嵌套一层元组或列表
        if len(image_list) == 1 and isinstance(image_list[0], list):
            image_list = image_list[0]

        for img in image_list:
            if isinstance(img, torch.Tensor):
                # 确保是标准 4D Tensor [B, H, W, C]，如果只有 3D 则补齐
                if img.ndim == 3:
                    img = img.unsqueeze(0)
                
                # 如果单个元素里包含了 Batch (B > 1)，我们拆开并遍历它
                if img.shape[0] > 1:
                    for sub_img in img:
                        sub_img = sub_img.unsqueeze(0)
                        h, w = sub_img.shape[1], sub_img.shape[2]
                        pixels = h * w
                        if pixels > max_pixels:
                            max_pixels = pixels
                            best_img = sub_img
                    continue

                h, w = img.shape[1], img.shape[2]
                pixels = h * w
                
                if pixels > max_pixels:
                    max_pixels = pixels
                    best_img = img

        if best_img is None:
            raise ValueError("列表中没有找到有效的图像数据！")

        print(f"[MaxResolutionFilter] 成功筛选出最大分辨率图像: {best_img.shape[2]}x{best_img.shape[1]}")

        return (best_img,)

NODE_CLASS_MAPPINGS = {
    "wcx_MaxResolutionFilter": MaxResolutionFilter
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_MaxResolutionFilter": "Max Resolution Filter"
}