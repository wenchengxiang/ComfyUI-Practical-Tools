# WCX Nodes - Bus (万能总线) 节点 (25通道·精简命名版)

class AnyType(str):
    """能够与 ComfyUI 中任意数据类型匹配的黑魔法类"""
    def __ne__(self, __value: object) -> bool:
        return False

    def __eq__(self, __value: object) -> bool:
        return True

    def __str__(self):
        return "*"

ANY = AnyType("*")

class WCXBusIn:
    @classmethod
    def INPUT_TYPES(cls):
        # 动态创建 25 个可选输入通道
        optional_inputs = {}
        for i in range(1, 26):
            optional_inputs[f"输入_{i}"] = (ANY, {"forceInput": True})
        
        return {
            "required": {},
            "optional": optional_inputs
        }

    # 缩短为主干线专用类型 "WCX_BUS"
    RETURN_TYPES = ("WCX_BUS",) 
    RETURN_NAMES = ("总线束",)
    FUNCTION = "pack_bus"
    CATEGORY = "Practical-Tools/Passthrough"

    def pack_bus(self, **kwargs):
        # 使用字典打包，只打包有实际连线的数据，规避后端图截断引发的元组长度报错
        bus_dict = {}
        for i in range(1, 26):
            val = kwargs.get(f"输入_{i}", None)
            if val is not None:
                bus_dict[str(i)] = val
        
        # 返回字典的副本，防止多路输出时由于引用传递导致 ComfyUI 缓存机制崩溃或数据污染
        return (bus_dict.copy(),)


class WCXBusOut:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                # 严格对接精简后的总线类型
                "总线束": ("WCX_BUS",), 
            }
        }

    # 动态吐出 25 个万能类型输出点
    RETURN_TYPES = tuple(ANY for _ in range(25))
    RETURN_NAMES = tuple(f"输出_{i}" for i in range(1, 26))
    FUNCTION = "unpack_bus"
    CATEGORY = "Practical-Tools/Passthrough"

    def unpack_bus(self, 总线束=None):
        # 强壮的非空与类型校验
        if 总线束 is None or not isinstance(总线束, dict):
            return tuple([None] * 25)
        
        # 精准按 Key 映射，无论前端截断或空接任何端口，均能稳定输出 25 长度元组
        results = []
        for i in range(1, 26):
            results.append(总线束.get(str(i), None))
            
        return tuple(results)


# 节点注册映射
NODE_CLASS_MAPPINGS = {
    "wcx_BusIn": WCXBusIn,
    "wcx_BusOut": WCXBusOut
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_BusIn": "Bus In",
    "wcx_BusOut": "Bus Out"
}