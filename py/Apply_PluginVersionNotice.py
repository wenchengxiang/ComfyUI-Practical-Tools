"""
wcx_ApplyPluginVersionNotice - 插件版本更新提醒标记节点

作用：工作流里放了这个节点且开关打开时，前端才会检查插件是否有新版本。
      纯开关节点，不需要额外数据（版本信息从远程配置拉取）。

改成真节点的原因：虚拟节点无法在子图里"提升"，真节点可以。
"""


class wcx_ApplyPluginVersionNotice:
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
                        "tooltip": "关闭后不再检查插件新版本",
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
    "wcx_ApplyPluginVersionNotice": wcx_ApplyPluginVersionNotice,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_ApplyPluginVersionNotice": "Apply Plugin Version Notice",
}
