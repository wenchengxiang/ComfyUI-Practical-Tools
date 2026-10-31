# Apply_GraphConstantFolderFastCache.py — Graph Constant Folder Fast Cache 标记节点
#
# 和 Apply Missing Model Replace / Apply Hide Partner Login Reminder 一样，
# 这是一个“工作流里放了才生效”的纯标记节点。
#
# 放了它，GraphConstantFolder 才会对该工作流启用：
#   - 常量开关折叠 + 不可达分支剪枝；
#   - 记忆化缓存签名（FAST_CACHE）。
# 没有它的工作流完全走 ComfyUI 原逻辑，插件不介入。

class wcx_Apply_GraphConstantFolderFastCache:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
        }

    FUNCTION = "execute"
    CATEGORY = "Practical-Tools/FunctionSwitchNode"

    RETURN_TYPES = ()
    OUTPUT_NODE = True

    def execute(self):
        return {}


NODE_CLASS_MAPPINGS = {
    "wcx_Apply_GraphConstantFolderFastCache": wcx_Apply_GraphConstantFolderFastCache,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_Apply_GraphConstantFolderFastCache": "Apply Graph Constant Folder Fast Cache",
}
