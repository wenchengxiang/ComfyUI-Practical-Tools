# Any_Compare.py - 自包含比较节点

class AnyType(str):
    def __ne__(self, __value: object) -> bool:
        return False
    def __eq__(self, __value: object) -> bool:
        return True
    def __str__(self):
        return "*"

any_type = AnyType("*")

# 比较函数映射
COMPARE_FUNCTIONS = {
    "a == b": lambda a, b: a == b,
    "a != b": lambda a, b: a != b,
    "a > b":  lambda a, b: a > b,
    "a >= b": lambda a, b: a >= b,
    "a < b":  lambda a, b: a < b,
    "a <= b": lambda a, b: a <= b,
}


class AnyCompare:
    NAME = "Any Compare"
    CATEGORY = "Practical-Tools/utils"

    @classmethod
    def INPUT_TYPES(cls):
        compare_functions = list(COMPARE_FUNCTIONS.keys())
        return {
            "optional": {
                "a": (any_type, {"default": 0}),
                "b": (any_type, {"default": 0}),
                "comparison": (compare_functions, {"default": "a == b"}),
            },
        }

    RETURN_TYPES = ("BOOLEAN",)
    RETURN_NAMES = ("boolean",)
    FUNCTION = "compare"

    def compare(self, a=0, b=0, comparison="a == b"):
        # 从映射中获取比较函数并执行
        result = COMPARE_FUNCTIONS[comparison](a, b)
        return (result,)


# 注册映射
NODE_CLASS_MAPPINGS = {
    "wcx_AnyCompare": AnyCompare,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_AnyCompare": "Any Compare",
}