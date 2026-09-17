class AnyType(str):
    def __ne__(self, __value: object) -> bool:
        return False
    def __eq__(self, __value: object) -> bool:
        return True
    def __str__(self):
        return "*"

any_type = AnyType("*")


class AnyToEnd:
    NAME = "Any To End"
    CATEGORY = "Practical-Tools/String"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "any": (any_type, {}),   # 接受任意类型，但实际不使用
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("string",)
    FUNCTION = "convert"

    def convert(self, any):
        # 忽略输入，始终返回 "end"
        return ("end",)


# 注册映射
NODE_CLASS_MAPPINGS = {
    "wcx_AnyToEnd": AnyToEnd,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_AnyToEnd": "Any To End",
}