class TextLineToList:
    NAME = "Text Line To List"
    CATEGORY = "Practical-Tools/String"   # 改为 String 分类

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": ("STRING", {"multiline": True, "default": ""}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("list",)
    OUTPUT_IS_LIST = (True,)
    FUNCTION = "execute"

    def execute(self, text):
        lines = text.split('\n')
        lines = [line for line in lines if line.strip()]
        return (lines,)


# 注册映射
NODE_CLASS_MAPPINGS = {
    "wcx_TextLineToList": TextLineToList,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_TextLineToList": "Text Line To List",
}