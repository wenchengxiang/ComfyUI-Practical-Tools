import folder_paths

class UpscaleModelSelector:
    @classmethod
    def INPUT_TYPES(s):
        # 核心：直接调用 ComfyUI 官方路径管理器，获取系统里所有放大模型的文件名列表
        upscale_models = folder_paths.get_filename_list("upscale_models")
        return {
            "required": {
                # 建立一个下拉选择菜单
                "model_name": (upscale_models, {"default": upscale_models[0] if upscale_models else ""}),
            }
        }

    # 输出类型为纯字符串 (STRING)
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("model_name",)
    FUNCTION = "output_name"
    CATEGORY = "WCXnodes/utils"  # 放到你的自定义分类菜单下

    def output_name(self, model_name):
        # 用户在前端 UI 下拉菜单里选了什么字符串，这里就直接返回什么字符串
        return (model_name,)

# 注册节点
NODE_CLASS_MAPPINGS = {
    "wcx_UpscaleModelSelector": UpscaleModelSelector
}

# 显示名称
NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_UpscaleModelSelector": "Upscale Model Selector"
}