from .utils import any_type


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
        # any is always a list because INPUT_IS_LIST=True
        # If there is only one element and it's a list/tuple, return its length
        if len(any) == 1 and isinstance(any[0], (list, tuple)):
            return (len(any[0]),)
        # Otherwise return the number of connected inputs (batch size)
        return (len(any),)


# 注册映射
NODE_CLASS_MAPPINGS = {
    "wcx_AnyLength": AnyLength,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_AnyLength": "Any Length",
}