import torch


class IsBatchImagesSame:
    NAME = "Is Batch Images Same"
    CATEGORY = "Practical-Tools/Image"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
            },
        }

    RETURN_TYPES = ("BOOLEAN",)
    RETURN_NAMES = ("boolean",)
    FUNCTION = "execute"

    def execute(self, images):
        if images is None or images.shape[0] <= 1:
            return (True,)
        same = torch.allclose(images[0], images[1], atol=1e-4)
        return (bool(same),)


NODE_CLASS_MAPPINGS = {
    "wcx_IsBatchImagesSame": IsBatchImagesSame,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_IsBatchImagesSame": "Is Batch Images Same",
}
