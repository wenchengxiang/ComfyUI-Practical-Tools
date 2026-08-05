import torch

class wcx_CreateList:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                # "*" 通配符允许连接任意数据类型，最多支持 10 个可选输入
                "input_1": ("*",),
                "input_2": ("*",),
                "input_3": ("*",),
                "input_4": ("*",),
                "input_5": ("*",),
                "input_6": ("*",),
                "input_7": ("*",),
                "input_8": ("*",),
                "input_9": ("*",),
                "input_10": ("*",),
            },
        }

    RETURN_TYPES = ("*",)
    RETURN_NAMES = ("list",)
    OUTPUT_IS_LIST = (True,)
    FUNCTION = "create_list"
    CATEGORY = "WCXnodes/utils"

    def create_list(self, **kwargs):
        output_list = []
        
        # 按 input_1 到 input_10 的顺序遍历提取数据
        for i in range(1, 11):
            key = f"input_{i}"
            if key in kwargs and kwargs[key] is not None:
                val = kwargs[key]
                # 如果传入的输入本身已经是列表，展开合并；否则追加单个元素
                if isinstance(val, list):
                    output_list.extend(val)
                else:
                    output_list.append(val)

        return (output_list,)

# 节点注册
NODE_CLASS_MAPPINGS = {
    "wcx_CreateList": wcx_CreateList
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_CreateList": "Create List"
}