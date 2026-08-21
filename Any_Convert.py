class AnyType(str):
    def __ne__(self, __value: object) -> bool:
        return False
    def __eq__(self, __value: object) -> bool:
        return True
    def __str__(self):
        return "*"

any_type = AnyType("*")


class AnyConvert:
    NAME = "Any Convert"
    CATEGORY = "Practical-Tools/utils"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "any": (any_type, {}),
                "output_type": (
                    ["combo", "string", "int", "float", "boolean"],
                    {"default": "combo"}  # 默认直通，更安全
                ),
            }
        }

    RETURN_TYPES = (any_type,)
    RETURN_NAMES = ("out",)
    OUTPUT_NODE = True
    FUNCTION = "convert"

    def convert(self, any, output_type):
        if output_type == "combo":
            result = any  # 原样透传
        elif output_type == "string":
            result = str(any)
        elif output_type == "int":
            result = int(any)
        elif output_type == "float":
            result = float(any)
        elif output_type == "boolean":
            result = self._to_bool(any)
        else:
            result = any
        return (result,)

    @staticmethod
    def _to_bool(value):
        """严格转换为布尔值，仅允许 0/1（整数、浮点数、字符串）。"""
        if isinstance(value, bool):
            return value
        if isinstance(value, int):
            if value == 0:
                return False
            if value == 1:
                return True
            raise ValueError(f"整数转布尔只允许 0 或 1，但收到了 {value}")
        if isinstance(value, float):
            if value == 0.0:
                return False
            if value == 1.0:
                return True
            raise ValueError(f"浮点数转布尔只允许 0.0 或 1.0，但收到了 {value}")
        if isinstance(value, str):
            if value == "0":
                return False
            if value == "1":
                return True
            raise ValueError(f"字符串转布尔只允许 '0' 或 '1'，但收到了 '{value}'")
        raise TypeError(f"无法将类型 {type(value)} 转换为布尔值")


# 注册映射
NODE_CLASS_MAPPINGS = {
    "wcx_AnyConvert": AnyConvert,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_AnyConvert": "Any Convert",
}