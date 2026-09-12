import torch


class ReverseImageBatch:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("images",)
    FUNCTION = "reverse"
    CATEGORY = "Practical-Tools/Image"


    def reverse(self, images):
        # 按 batch 维度反转图像顺序
        return (images.flip(0),)


NODE_CLASS_MAPPINGS = {
    "ReverseImageBatch": ReverseImageBatch,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ReverseImageBatch": "Reverse Image Batch",
}