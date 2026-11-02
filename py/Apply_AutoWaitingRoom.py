"""
wcx_Apply_AutoWaitingRoom - 运行时自动进出"运行等待区"

放到工作流里，前端会在运行开始后等待「延迟秒数」：
  * 如果运行在延迟内结束 -> 全程不进等待区（快结果不闪）
  * 如果还在跑          -> 切进等待区（画布只剩说明文字，渲染负担极低）
运行结束后自动切回原位置和视图。

只对放了本节点的工作流生效。
"""


class wcx_Apply_AutoWaitingRoom:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "延迟秒数": (
                    "FLOAT",
                    {
                        "default": 2.0,
                        "min": 0.0,
                        "max": 60.0,
                        "step": 0.5,
                        "tooltip": "运行超过这个秒数还没结束才自动进入等待区；0 = 立即进入",
                    },
                ),
            },
        }

    RETURN_TYPES = ()
    FUNCTION = "do_nothing"
    CATEGORY = "Practical-Tools/FunctionSwitchNode"
    OUTPUT_NODE = True

    def do_nothing(self, 延迟秒数=2.0):
        return {}


NODE_CLASS_MAPPINGS = {
    "wcx_Apply_AutoWaitingRoom": wcx_Apply_AutoWaitingRoom,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_Apply_AutoWaitingRoom": "Apply Auto Waiting Room",
}
