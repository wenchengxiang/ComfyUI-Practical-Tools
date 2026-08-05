import re
import folder_paths

class LoraLoadWithTrigger:
    @classmethod
    def INPUT_TYPES(s):
        loras = folder_paths.get_filename_list("loras")
        return {
            "required": {
                "lora_name": (loras, {"default": loras[0] if loras else ""}),
                "strength": ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.01}),
            }
        }

    RETURN_TYPES = ('STRING', "FLOAT", "STRING")
    RETURN_NAMES = ("lora_name", "strength", "trigger_words")
    FUNCTION = "extract_lora_info"
    CATEGORY = "WCXnodes/Lora"
    OUTPUT_NODE = True

    def extract_lora_info(self, lora_name, strength):
        # 从文件名提取方括号内的触发词
        matches = re.findall(r'\[(.*?)\]', lora_name)
        trigger_words = ", ".join(matches) if matches else " "
        
        # 返回结果并包含显示文本
        return {
            "result": (lora_name, strength, trigger_words)
        }

# 节点注册
NODE_CLASS_MAPPINGS = {
    "wcx_LoraLoadWithTrigger": LoraLoadWithTrigger
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_LoraLoadWithTrigger": "Lora Load With Trigger"
}