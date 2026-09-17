import torch


class IsMaskBlack:
    NAME = "Is Mask Black"
    CATEGORY = "Practical-Tools/Mask"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "mask": ("MASK",),
            },
        }

    RETURN_TYPES = ("BOOLEAN",)
    RETURN_NAMES = ("boolean",)
    FUNCTION = "execute"

    def execute(self, mask):
        # 如果 mask 为 None 或全为 0（黑色），返回 True
        if mask is None:
            return (True,)
        if torch.all(mask == 0):
            return (True,)
        return (False,)


# 注册映射
NODE_CLASS_MAPPINGS = {
    "wcx_IsMaskBlack": IsMaskBlack,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_IsMaskBlack": "Is Mask Black",
}