import torch


class AnyType(str):
    def __ne__(self, __value: object) -> bool:
        return False
    def __eq__(self, __value: object) -> bool:
        return True
    def __str__(self):
        return "*"

any_type = AnyType("*")


class AnyLength:
    NAME = "Any Length"
    CATEGORY = "Practical-Tools/utils"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "any": (any_type, {}),
            }
        }

    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("length",)
    INPUT_IS_LIST = True
    FUNCTION = "get_length"

    def get_length(self, any):
        # 如果只有一个输入连接
        if len(any) == 1:
            data = any[0]
            if isinstance(data, (list, tuple)):
                return (len(data),)
            elif isinstance(data, torch.Tensor):
                # 张量：返回第0维大小（标量返回1）
                return (data.shape[0] if data.dim() > 0 else 1,)
            else:
                # 单个值（字符串、整数、None等）
                return (1,)
        # 多个连接，返回连接数
        return (len(any),)


# 注册映射
NODE_CLASS_MAPPINGS = {
    "wcx_AnyLength": AnyLength,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_AnyLength": "Any Length",
}