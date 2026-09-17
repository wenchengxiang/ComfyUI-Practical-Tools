# 1. 在本地直接定义 ComfyUI 通配符类型（AnyType），不再依赖外部文件
class AnyType(str):
    def __ne__(self, __value: object) -> bool:
        # 这个魔法方法让这个类型与任何其他类型比对时都返回 False（即“不互斥”），从而实现万能连线
        return False

anything = AnyType('*')

class AnyRerouter():

    def __init__(self):
        self.NODE_NAME = 'AnyRerouter'

    @classmethod
    def INPUT_TYPES(cls):  
        return {
            "required": {
                "any_value": (anything, {}), # 避免使用 any 关键字
            },
            "optional": {}
        }

    RETURN_TYPES = (anything,)
    RETURN_NAMES = ('any_value',)
    FUNCTION = 'any_rerouter'
    CATEGORY = 'Practical-Tools/Passthrough'

    def any_rerouter(self, any_value):
        return (any_value,)

# 注册节点
NODE_CLASS_MAPPINGS = {
    "wcx_AnyRerouter": AnyRerouter
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_AnyRerouter": "Any Rerouter"
}