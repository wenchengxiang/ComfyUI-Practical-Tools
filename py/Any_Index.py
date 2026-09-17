class AnyType(str):
    def __ne__(self, __value: object) -> bool:
        return False
    def __eq__(self, __value: object) -> bool:
        return True
    def __str__(self):
        return "*"

any_type = AnyType("*")
lazy_options = {"lazy": True}


# ============ 5 输入版本 ============
class AnyIndexSimple:
    NAME = "Any Index Simple"
    CATEGORY = "Practical-Tools/utils"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "index": ("INT", {"default": 0, "min": 0, "max": 4, "step": 1}),
            },
            "optional": {
                "value_0": (any_type, lazy_options),
                "value_1": (any_type, lazy_options),
                "value_2": (any_type, lazy_options),
                "value_3": (any_type, lazy_options),
                "value_4": (any_type, lazy_options),
            }
        }

    RETURN_TYPES = (any_type,)
    RETURN_NAMES = ("value",)
    FUNCTION = "index_switch"

    def check_lazy_status(self, index, **kwargs):
        key = f"value_{index}"
        if kwargs.get(key, None) is None:
            return [key]

    def index_switch(self, index, **kwargs):
        key = f"value_{index}"
        return (kwargs.get(key, None),)


# ============ 15 输入版本 ============
class AnyIndex:
    NAME = "Any Index"
    CATEGORY = "Practical-Tools/utils"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "index": ("INT", {"default": 0, "min": 0, "max": 14, "step": 1}),
            },
            "optional": {
                "value_0": (any_type, lazy_options),
                "value_1": (any_type, lazy_options),
                "value_2": (any_type, lazy_options),
                "value_3": (any_type, lazy_options),
                "value_4": (any_type, lazy_options),
                "value_5": (any_type, lazy_options),
                "value_6": (any_type, lazy_options),
                "value_7": (any_type, lazy_options),
                "value_8": (any_type, lazy_options),
                "value_9": (any_type, lazy_options),
                "value_10": (any_type, lazy_options),
                "value_11": (any_type, lazy_options),
                "value_12": (any_type, lazy_options),
                "value_13": (any_type, lazy_options),
                "value_14": (any_type, lazy_options),
            }
        }

    RETURN_TYPES = (any_type,)
    RETURN_NAMES = ("value",)
    FUNCTION = "index_switch"

    def check_lazy_status(self, index, **kwargs):
        key = f"value_{index}"
        if kwargs.get(key, None) is None:
            return [key]

    def index_switch(self, index, **kwargs):
        key = f"value_{index}"
        return (kwargs.get(key, None),)


# ============ 25 输入版本 ============
class AnyIndexStrong:
    NAME = "Any Index Strong"
    CATEGORY = "Practical-Tools/utils"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "index": ("INT", {"default": 0, "min": 0, "max": 24, "step": 1}),
            },
            "optional": {
                "value_0": (any_type, lazy_options),
                "value_1": (any_type, lazy_options),
                "value_2": (any_type, lazy_options),
                "value_3": (any_type, lazy_options),
                "value_4": (any_type, lazy_options),
                "value_5": (any_type, lazy_options),
                "value_6": (any_type, lazy_options),
                "value_7": (any_type, lazy_options),
                "value_8": (any_type, lazy_options),
                "value_9": (any_type, lazy_options),
                "value_10": (any_type, lazy_options),
                "value_11": (any_type, lazy_options),
                "value_12": (any_type, lazy_options),
                "value_13": (any_type, lazy_options),
                "value_14": (any_type, lazy_options),
                "value_15": (any_type, lazy_options),
                "value_16": (any_type, lazy_options),
                "value_17": (any_type, lazy_options),
                "value_18": (any_type, lazy_options),
                "value_19": (any_type, lazy_options),
                "value_20": (any_type, lazy_options),
                "value_21": (any_type, lazy_options),
                "value_22": (any_type, lazy_options),
                "value_23": (any_type, lazy_options),
                "value_24": (any_type, lazy_options),
            }
        }

    RETURN_TYPES = (any_type,)
    RETURN_NAMES = ("value",)
    FUNCTION = "index_switch"

    def check_lazy_status(self, index, **kwargs):
        key = f"value_{index}"
        if kwargs.get(key, None) is None:
            return [key]

    def index_switch(self, index, **kwargs):
        key = f"value_{index}"
        return (kwargs.get(key, None),)


# ============ 注册映射 ============
NODE_CLASS_MAPPINGS = {
    "wcx_AnyIndexSimple": AnyIndexSimple,
    "wcx_AnyIndex": AnyIndex,
    "wcx_AnyIndexStrong": AnyIndexStrong,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_AnyIndexSimple": "Any Index Simple",
    "wcx_AnyIndex": "Any Index",
    "wcx_AnyIndexStrong": "Any Index Strong",
}