import nodes # 导入整个 nodes 模块以获取 PreviewImage 类

class WCXImageComparer:
    """WCX 图像对比节点（已修复叠加预览问题）"""

    # 模仿 PreviewImage 的 INPUT_TYPES，但我们不再继承它
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "image_a": ("IMAGE",),
                "image_b": ("IMAGE",),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO"
            },
        }

    # 声明输出类型和输出接口名称
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image_a",)
    
    # 必须声明为输出节点，ComfyUI 才会执行它并把 UI 数据传给前端
    OUTPUT_NODE = True 
    
    FUNCTION = "compare_images"
    CATEGORY = "Practical-Tools/image"
    DESCRIPTION = "在前端提供可拖动滑动条/点击对比两张图像的功能，并可输出图像 A"

    def compare_images(self,
                       image_a=None,
                       image_b=None,
                       filename_prefix="wcx.compare.",
                       prompt=None,
                       extra_pnginfo=None):

        result = {"ui": {"a_images": [], "b_images": []}}
        
        # 实例化一个标准的 PreviewImage 用于保存图片到 temp 目录
        # 这样我们既利用了它的保存逻辑，又不会触发它的节点预览逻辑
        preview_node = nodes.PreviewImage()

        if image_a is not None and len(image_a) > 0:
            # 调用 preview_node 的 save_images
            saved_a = preview_node.save_images(image_a, filename_prefix, prompt, extra_pnginfo)
            result['ui']['a_images'] = saved_a['ui']['images']

        if image_b is not None and len(image_b) > 0:
            saved_b = preview_node.save_images(image_b, filename_prefix, prompt, extra_pnginfo)
            result['ui']['b_images'] = saved_b['ui']['images']

        # 返回元组第一个元素即为输出端口的 image_a 数据，后面跟 UI 交互字典
        result["result"] = (image_a,)
        return result

# 节点注册
NODE_CLASS_MAPPINGS = {
    "wcx_ImageComparer": WCXImageComparer
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_ImageComparer": "Image Comparer"
}