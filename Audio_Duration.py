# =====================================================================
# 独立提取并优化的音频时长获取节点 (AudioDuration)
# 命名与注册完全对齐 wcx 自定义插件规范，已彻底移除所有控制台打印与日志
# =====================================================================

class AudioDuration:
    """获取音频的毫秒级时长"""
    
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "audio": ("AUDIO",),
            },
        }

    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("duration_ms",)
    FUNCTION = "get_duration"
    CATEGORY = "Practical-Tools/audio"

    def get_duration(self, audio):
        waveform = audio["waveform"]
        sample_rate = audio["sample_rate"]

        duration_ms = int((waveform.shape[-1] / sample_rate) * 1000)

        return (duration_ms,)

# =====================================================================
# 核心规范：节点注册映射字典（类映射键名严格加 wcx_ 前缀，展示名对齐）
# =====================================================================
NODE_CLASS_MAPPINGS = {
    "wcx_AudioDuration": AudioDuration
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_AudioDuration": "Audio Duration"
}