class AnyType(str):
    """A special type that compares equal to any other type."""
    def __ne__(self, __value: object) -> bool:
        return False

    def __eq__(self, __value: object) -> bool:
        return True

    def __str__(self):
        return "*"

ANY = AnyType("*")

class LinkSwitch:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "输入": (ANY,),
                "开关": ("BOOLEAN", {"default": True, "label_on": "开启", "label_off": "关闭"}),
            }
        }

    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("输出",)
    FUNCTION = "LinkSwitch"
    CATEGORY = "WCXnodes/utils"

    @classmethod
    def VALIDATE_INPUTS(cls, input_types):
        return True

    def LinkSwitch(self, 开关, 输入=None):
        if 开关:
            return (输入,)
        else:
            return (None,)

# 节点注册
NODE_CLASS_MAPPINGS = {
    "wcx_LinkSwitch": LinkSwitch
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_LinkSwitch": "Link Switch"
}
