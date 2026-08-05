class AudioPass:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {},
            "optional": {
                # 传入一个元组，第二个元素是配置字典，设置 forceInput 为 True
                "audio": ("AUDIO", {"forceInput": True}), 
            }
        }

    RETURN_TYPES = ("AUDIO",)
    RETURN_NAMES = ("audio",)
    FUNCTION = "pass_through"
    CATEGORY = "WCXnodes/utils"

    def pass_through(self, audio=None):
        if audio is None:
            return (None,)
        return (audio,)

# 节点注册
NODE_CLASS_MAPPINGS = {
    "wcx_AudioPass": AudioPass
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_AudioPass": "Audio Pass"
}
