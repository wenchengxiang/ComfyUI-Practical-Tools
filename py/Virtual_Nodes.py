"""
Virtual Nodes —— 前端虚拟节点的 Python 占位注册
用途：让 ComfyUI Manager 能识别这些前端虚拟节点属于 Practical-Tools 插件，
     从而在"工作流中插件"功能中显示本插件，并支持一键安装。
说明：这些节点的实际功能由前端 JS 实现，Python 占位类不执行任何逻辑。
     前端注册会覆盖本占位类，不影响实际使用。
"""


class _VirtualPlaceholder:
    """前端虚拟节点的占位基类：不执行任何逻辑，仅用于注册识别"""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "passthrough": ("*", {}),
            },
        }

    FUNCTION = "execute"
    CATEGORY = "Practical-Tools/virtual"
    RETURN_TYPES = ("*",)
    RETURN_NAMES = ("passthrough",)

    def execute(self, **kwargs):
        # 占位节点不执行任何逻辑，直接透传输入
        return (kwargs.get("passthrough"),)


class PTSetNode(_VirtualPlaceholder):
    pass


class PTGetNode(_VirtualPlaceholder):
    pass


class PTNote(_VirtualPlaceholder):
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}}

    RETURN_TYPES = ()
    RETURN_NAMES = ()

    def execute(self, **kwargs):
        return ()


class TextLabel(_VirtualPlaceholder):
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}}

    RETURN_TYPES = ()
    RETURN_NAMES = ()

    def execute(self, **kwargs):
        return ()


class Bookmark(_VirtualPlaceholder):
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}}

    RETURN_TYPES = ()
    RETURN_NAMES = ()

    def execute(self, **kwargs):
        return ()


# ==========================================
# 注册与显示名称
# ==========================================
NODE_CLASS_MAPPINGS = {
    "PTSetNode": PTSetNode,
    "PTGetNode": PTGetNode,
    "PTNote": PTNote,
    "Text Label": TextLabel,
    "Bookmark": Bookmark,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "PTSetNode": "PT Set",
    "PTGetNode": "PT Get",
    "PTNote": "PT Note",
    "Text Label": "Text Label",
    "Bookmark": "Bookmark",
}
