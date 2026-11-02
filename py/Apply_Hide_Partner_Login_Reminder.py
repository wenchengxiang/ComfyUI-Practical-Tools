"""
wcx_Apply_Hide_Partner_Login_Reminder - 隐藏合作伙伴节点登录提醒
放到工作流里，前端就会隐藏"登录以运行"按钮和"合作伙伴节点需要账户"横幅
"""


class wcx_Apply_Hide_Partner_Login_Reminder:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "开关": ("BOOLEAN", {"default": True, "label_on": "启用", "label_off": "禁用", "tooltip": "关闭后本节点功能不生效（等价于没有这个节点）"}),
            },
        }

    RETURN_TYPES = ()
    FUNCTION = "do_nothing"
    CATEGORY = "Practical-Tools/FunctionSwitchNode"
    OUTPUT_NODE = True

    def do_nothing(self, 开关=True):
        return {}


NODE_CLASS_MAPPINGS = {
    "wcx_Apply_Hide_Partner_Login_Reminder": wcx_Apply_Hide_Partner_Login_Reminder,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_Apply_Hide_Partner_Login_Reminder": "Apply Hide Partner Login Reminder",
}
