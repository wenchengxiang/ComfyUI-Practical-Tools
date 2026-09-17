class wcx_BooleanNot:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                # 原版的 value 变更为“布尔值”，并强制要求连线输入
                "布尔值": ("BOOLEAN", {"forceInput": True}), 
            },
        }

    FUNCTION = "execute"
    CATEGORY = "Practical-Tools/utils"

    RETURN_TYPES = ("BOOLEAN", )
    RETURN_NAMES = ("取反结果", )

    def execute(self, 布尔值):
        # 核心逻辑：对输入的布尔值进行逻辑取反（not）
        return (not 布尔值, )


# ==========================================
# 注册与显示名称
# ==========================================
NODE_CLASS_MAPPINGS = {
    "wcx_BooleanNot": wcx_BooleanNot
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_BooleanNot": "Boolean Not"
}