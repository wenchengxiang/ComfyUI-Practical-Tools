import random


class RandomPath:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "模式": (
                    ["random", "custom"],
                    {"default": "random"},
                ),
                # 内部不要命名为 seed，避免 ComfyUI 前端自动添加“生成后控制”
                "custom_path": (
                    "INT",
                    {
                        "default": 0,
                        "min": 0,
                        "max": 1125899906842624,
                        "step": 1,
                    },
                ),
            }
        }

    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("path",)
    FUNCTION = "RandomPath"
    CATEGORY = "Practical-Tools/utils"

    @classmethod
    def IS_CHANGED(cls, 模式, custom_path):
        # random 模式每次都强制重新执行，
        # 因此打开保存的工作流后第一次运行也会随机。
        if 模式 == "random":
            return random.random()

        # fixed 模式使用固定输入值，可正常缓存。
        return custom_path

    def RandomPath(self, 模式, custom_path):
        if 模式 == "random":
            custom_path = random.randint(0, 1125899906842624)

        return (custom_path,)


# 节点注册
NODE_CLASS_MAPPINGS = {
    "wcx_RandomPath": RandomPath
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_RandomPath": "Random Path"
}
