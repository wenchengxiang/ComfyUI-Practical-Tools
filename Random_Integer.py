import random

class RandomIntegerNode:
    """
    生成指定范围内的随机整数节点
    """
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "min_value": ("INT", {
                    "default": 0, 
                    "min": -0xffffffffffffffff, 
                    "max": 0xffffffffffffffff, 
                    "step": 1,
                    "display": "number"
                }),
                "max_value": ("INT", {
                    "default": 100, 
                    "min": -0xffffffffffffffff, 
                    "max": 0xffffffffffffffff, 
                    "step": 1,
                    "display": "number"
                }),
                "seed": ("INT", {
                    "default": 0, 
                    "min": 0, 
                    "max": 0xffffffffffffffff,
                    "control_after_generate": "randomize"  # 让每次生成时自动随机 Seed
                }),
            }
        }

    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("int_value",)
    FUNCTION = "generate_random_int"
    CATEGORY = "WCXnodes/utils"

    def generate_random_int(self, min_value, max_value, seed):
        # 使用种子确保每次运行可复现（或由控制按钮随机）
        random.seed(seed)
        
        # 兼容用户误将最小值设得比最大值大的情况
        actual_min = min(min_value, max_value)
        actual_max = max(min_value, max_value)
        
        result = random.randint(actual_min, actual_max)
        return (result,)

# 注册节点到你的框架中
NODE_CLASS_MAPPINGS = {
    "wcx_RandomInteger": RandomIntegerNode
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_RandomInteger": "Random Integer"
}