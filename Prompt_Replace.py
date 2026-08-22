class PromptReplace:
    NAME = "Prompt Replace"
    CATEGORY = "Practical-Tools/String"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "prompt": ("STRING", {"multiline": True, "default": "", "forceInput": True}),
            },
            "optional": {
                "find1": ("STRING", {"multiline": False, "default": ""}),
                "replace1": ("STRING", {"multiline": False, "default": ""}),
                "find2": ("STRING", {"multiline": False, "default": ""}),
                "replace2": ("STRING", {"multiline": False, "default": ""}),
                "find3": ("STRING", {"multiline": False, "default": ""}),
                "replace3": ("STRING", {"multiline": False, "default": ""}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("prompt",)
    FUNCTION = "execute"

    def execute(self, prompt, find1="", replace1="", find2="", replace2="", find3="", replace3=""):
        # 按顺序执行替换
        if find1:
            prompt = prompt.replace(find1, replace1)
        if find2:
            prompt = prompt.replace(find2, replace2)
        if find3:
            prompt = prompt.replace(find3, replace3)
        return (prompt,)


# 注册映射
NODE_CLASS_MAPPINGS = {
    "wcx_PromptReplace": PromptReplace,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_PromptReplace": "Prompt Replace",
}