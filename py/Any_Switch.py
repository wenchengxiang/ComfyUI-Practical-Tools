class AnyType(str):
    def __ne__(self, __value: object) -> bool:
        return False
    def __eq__(self, __value: object) -> bool:
        return True
    def __str__(self):
        return "*"

any_type = AnyType("*")


def is_context_empty(context):
    """检查上下文（包含 model 和 clip 的字典）是否为空。"""
    if isinstance(context, dict):
        model = context.get('model')
        clip = context.get('clip')
        if model is None or clip is None:
            return True
    return False


def is_none(value):
    """Checks if a value is none."""
    if value is not None:
        if isinstance(value, dict) and 'model' in value and 'clip' in value:
            return is_context_empty(value)
    return value is None


# ============ 5 输入版本 (Simple) ============
class AnySwitchSimple:
    """静态 5 路 Any Switch，按顺序输出第一个非空值。"""

    NAME = "Any Switch Simple"
    CATEGORY = "Practical-Tools/utils"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "any_1": (any_type, {"default": None}),
                "any_2": (any_type, {"default": None}),
                "any_3": (any_type, {"default": None}),
                "any_4": (any_type, {"default": None}),
                "any_5": (any_type, {"default": None}),
            }
        }

    RETURN_TYPES = (any_type,)
    RETURN_NAMES = ('*',)
    FUNCTION = "switch"

    def switch(self, **kwargs):
        any_value = None
        for key, value in kwargs.items():
            if key.startswith('any_') and not is_none(value):
                any_value = value
                break
        return (any_value,)


# ============ 15 输入版本 ============
class AnySwitch:
    """静态 15 路 Any Switch，按顺序输出第一个非空值。"""

    NAME = "Any Switch"
    CATEGORY = "Practical-Tools/utils"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "any_1":  (any_type, {"default": None}),
                "any_2":  (any_type, {"default": None}),
                "any_3":  (any_type, {"default": None}),
                "any_4":  (any_type, {"default": None}),
                "any_5":  (any_type, {"default": None}),
                "any_6":  (any_type, {"default": None}),
                "any_7":  (any_type, {"default": None}),
                "any_8":  (any_type, {"default": None}),
                "any_9":  (any_type, {"default": None}),
                "any_10": (any_type, {"default": None}),
                "any_11": (any_type, {"default": None}),
                "any_12": (any_type, {"default": None}),
                "any_13": (any_type, {"default": None}),
                "any_14": (any_type, {"default": None}),
                "any_15": (any_type, {"default": None}),
            }
        }

    RETURN_TYPES = (any_type,)
    RETURN_NAMES = ('*',)
    FUNCTION = "switch"

    def switch(self, **kwargs):
        any_value = None
        for key, value in kwargs.items():
            if key.startswith('any_') and not is_none(value):
                any_value = value
                break
        return (any_value,)


# ============ 25 输入版本 (Strong) ============
class AnySwitchStrong:
    """静态 25 路 Any Switch，按顺序输出第一个非空值。"""

    NAME = "Any Switch Strong"
    CATEGORY = "Practical-Tools/utils"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "any_1":  (any_type, {"default": None}),
                "any_2":  (any_type, {"default": None}),
                "any_3":  (any_type, {"default": None}),
                "any_4":  (any_type, {"default": None}),
                "any_5":  (any_type, {"default": None}),
                "any_6":  (any_type, {"default": None}),
                "any_7":  (any_type, {"default": None}),
                "any_8":  (any_type, {"default": None}),
                "any_9":  (any_type, {"default": None}),
                "any_10": (any_type, {"default": None}),
                "any_11": (any_type, {"default": None}),
                "any_12": (any_type, {"default": None}),
                "any_13": (any_type, {"default": None}),
                "any_14": (any_type, {"default": None}),
                "any_15": (any_type, {"default": None}),
                "any_16": (any_type, {"default": None}),
                "any_17": (any_type, {"default": None}),
                "any_18": (any_type, {"default": None}),
                "any_19": (any_type, {"default": None}),
                "any_20": (any_type, {"default": None}),
                "any_21": (any_type, {"default": None}),
                "any_22": (any_type, {"default": None}),
                "any_23": (any_type, {"default": None}),
                "any_24": (any_type, {"default": None}),
                "any_25": (any_type, {"default": None}),
            }
        }

    RETURN_TYPES = (any_type,)
    RETURN_NAMES = ('*',)
    FUNCTION = "switch"

    def switch(self, **kwargs):
        any_value = None
        for key, value in kwargs.items():
            if key.startswith('any_') and not is_none(value):
                any_value = value
                break
        return (any_value,)


# ============ 统一注册映射 ============
NODE_CLASS_MAPPINGS = {
    "wcx_AnySwitchSimple": AnySwitchSimple,
    "wcx_AnySwitch": AnySwitch,
    "wcx_AnySwitchStrong": AnySwitchStrong,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_AnySwitchSimple": "Any Switch Simple",
    "wcx_AnySwitch": "Any Switch",
    "wcx_AnySwitchStrong": "Any Switch Strong",
}