import torch


class AnyType(str):
    def __ne__(self, __value: object) -> bool:
        return False
    def __eq__(self, __value: object) -> bool:
        return True
    def __str__(self):
        return "*"

any_type = AnyType("*")


class IndexAnything:
    NAME = "Index Anything"
    CATEGORY = "Practical-Tools/utils"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "any": (any_type, {}),
                "index": ("INT", {"default": 0, "min": -1000000, "max": 1000000, "step": 1}),
            }
        }

    RETURN_TYPES = (any_type,)
    RETURN_NAMES = ("out",)
    INPUT_IS_LIST = True
    FUNCTION = "get_index"

    def get_index(self, any, index):
        idx = index[0]  # 因为 INPUT_IS_LIST=True，index 是列表
        # 如果只有一个输入，尝试从其内部取元素
        if len(any) == 1:
            data = any[0]
            if isinstance(data, torch.Tensor):
                length = data.shape[0] if data.dim() > 0 else 1
                idx = self._normalize_index(idx, length)
                return (data[idx:idx+1].clone(),)
            elif isinstance(data, (list, tuple)):
                length = len(data)
                idx = self._normalize_index(idx, length)
                return (data[idx],)
            else:
                # 非容器类型，直接返回原值
                return (data,)
        else:
            # 多个输入，按列表索引选择
            length = len(any)
            idx = self._normalize_index(idx, length)
            return (any[idx],)

    @staticmethod
    def _normalize_index(index, length):
        if length <= 0:
            return 0
        if index < 0:
            index = length + index
        if index < 0:
            index = 0
        elif index >= length:
            index = length - 1
        return index


# 注册映射
NODE_CLASS_MAPPINGS = {
    "wcx_IndexAnything": IndexAnything,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_IndexAnything": "Index Anything",
}