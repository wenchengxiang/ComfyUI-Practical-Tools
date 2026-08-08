class AnyType(str):
    """A special type that compares equal to any other type."""
    def __ne__(self, __value: object) -> bool:
        return False

    def __eq__(self, __value: object) -> bool:
        return True

    def __str__(self):
        return "*"

ANY = AnyType("*")

# 规范：类名保持纯净大驼峰
class StringToCombo:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": ("STRING", {"multiline": False, "default": "", "forceInput": True}),
            },
        }

    # 输出保持完全对齐你工作流的万能通配符
    RETURN_TYPES = (ANY, )
    RETURN_NAMES = ("any", )
    FUNCTION = "convert"
    CATEGORY = "Practical-Tools/utils" 

    def convert(self, text):
        # 100% 严格复刻原版运行行为：即使被逗号切分，也只返回单项文本字符串，确保下游能够完美读取
        text_out = ""
        if text != "":
            values = text.split(',')
            text_out = values[0]
            print(f"[StringToCombo Output]: {text_out}") # 保留控制台打印方便你调试

        # 核心：必须返回字符串（str），绝不能是列表（list），下游节点（如LoRA）才能正常解析路径
        return (text_out, )

# =====================================================================
# 核心规范：节点注册映射字典（类映射键名严格加 wcx_ 前缀，展示名对齐）
# =====================================================================
NODE_CLASS_MAPPINGS = {
    "wcx_StringToCombo": StringToCombo
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_StringToCombo": "String To Combo"
}