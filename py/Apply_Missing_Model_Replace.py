"""
Apply Missing Model Replace —— 缺失模型自动替换标记节点
功能：
  这是一个纯标记节点。当工作流中包含此节点时，
  Missing_Model_Replace.js 插件会在加载工作流后自动检测并替换缺失的模型。
  不包含此节点的工作流不会触发自动替换。

使用方法：
  1. 在需要自动替换缺失模型的工作流中添加此节点
  2. 保存工作流。下次打开时会自动替换缺失模型
"""


class wcx_Apply_Missing_Model_Replace:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "开关": ("BOOLEAN", {"default": True, "label_on": "启用", "label_off": "禁用", "tooltip": "关闭后本节点功能不生效（等价于没有这个节点）"}),
            },
        }

    FUNCTION = "execute"
    CATEGORY = "Practical-Tools/FunctionSwitchNode"

    RETURN_TYPES = ()
    OUTPUT_NODE = True

    def execute(self, 开关=True):
        if not 开关:
            return {}
        result = {
            "ui": {
                "text": ["缺失模型自动替换：已启用\n加载工作流时将自动检测并替换缺失模型。"]
            },
            "result": ()
        }
        return result


NODE_CLASS_MAPPINGS = {
    "wcx_Apply_Missing_Model_Replace": wcx_Apply_Missing_Model_Replace
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_Apply_Missing_Model_Replace": "Apply Missing Model Replace"
}