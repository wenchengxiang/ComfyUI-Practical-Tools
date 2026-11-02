"""
wcx_ApplyGraphMeta - 图元数据标记节点（原 `wcx_ApplyWorkflowKeyGuard` 的前端虚拟节点已改为真节点）

作用：作为"关键元素校验"的开关。工作流里放了这个节点且开关打开时，
      必须存在含保护标记的 PTNote，否则前端会拒绝运行。

改成真节点的原因：虚拟节点无法在子图里"提升"，真节点可以。
"""


class wcx_ApplyGraphMeta:
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
                        "tooltip": "关闭后不再校验关键元素（等价于没有这个节点）",
                    },
                ),
            },
        }

    RETURN_TYPES = ()
    FUNCTION = "execute"
    CATEGORY = "Practical-Tools/FunctionSwitchNode"
    OUTPUT_NODE = True

    def execute(self, 开关=True):
        return {}


NODE_CLASS_MAPPINGS = {
    "wcx_ApplyGraphMeta": wcx_ApplyGraphMeta,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_ApplyGraphMeta": "Apply Graph Meta",
}
