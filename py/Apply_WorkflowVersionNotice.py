"""
wcx_ApplyWorkflowVersionNotice - 工作流版本提醒标记节点

作用：工作流里放了这个节点且开关打开时，前端会拿「当前版本」和远程配置里的
      最新版本比较，落后时弹出更新提醒。

字段：
  当前版本  单行文本，例如 `最新版本: 2.0.26`
  启用      总开关

改成真节点的原因：虚拟节点无法在子图里"提升"，真节点可以。
"""


class wcx_ApplyWorkflowVersionNotice:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "开关": (
                    "BOOLEAN",
                    {
                        "default": True,
                        "label_on": "启用",
                        "label_off": "禁用",
                        "tooltip": "关闭后不再检查工作流版本",
                    },
                ),
                "当前版本": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": False,
                        "tooltip": "例如：最新版本: 2.0.26（会从中提取版本号用于比较）",
                    },
                ),
            },
        }

    RETURN_TYPES = ()
    FUNCTION = "execute"
    CATEGORY = "Practical-Tools/FunctionSwitchNode"
    OUTPUT_NODE = True

    def execute(self, 开关=True, 当前版本=""):
        return {}


NODE_CLASS_MAPPINGS = {
    "wcx_ApplyWorkflowVersionNotice": wcx_ApplyWorkflowVersionNotice,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_ApplyWorkflowVersionNotice": "Apply Workflow Version Notice",
}
