import torch

class wcx_MaskBatch:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
            },
            "optional": {
                "masks_a": ("MASK",),
                "masks_b": ("MASK",),
                "masks_c": ("MASK",),
                "masks_d": ("MASK",),
                # "masks_e": ("MASK",),
                # "masks_f": ("MASK",),
                # Theoretically, an infinite number of mask input parameters can be added.
            },
        }

    RETURN_TYPES = ("MASK",)
    RETURN_NAMES = ("masks",)
    FUNCTION = "mask_batch"
    CATEGORY = "Practical-Tools/Mask"

    def _check_mask_dimensions(self, tensors, names):
        dimensions = [tensor.shape[1:] for tensor in tensors]  # Exclude the batch dimension (if present)
        if len(set(dimensions)) > 1:
            mismatched_indices = [i for i, dim in enumerate(dimensions) if dim != dimensions[0]]
            mismatched_masks = [names[i] for i in mismatched_indices]
            raise ValueError(f"WAS Mask Batch Warning: Input mask dimensions do not match for masks: {mismatched_masks}")

    def mask_batch(self, **kwargs):
        batched_tensors = [kwargs[key] for key in kwargs if kwargs[key] is not None]
        mask_names = [key for key in kwargs if kwargs[key] is not None]

        if not batched_tensors:
            raise ValueError("At least one input mask must be provided.")

        self._check_mask_dimensions(batched_tensors, mask_names)
        batched_tensors = torch.stack(batched_tensors, dim=0)
        batched_tensors = batched_tensors.unsqueeze(1)  # Add a channel dimension
        return (batched_tensors,)

# 节点注册
NODE_CLASS_MAPPINGS = {
    "wcx_MaskBatch": wcx_MaskBatch
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_MaskBatch": "Mask Batch"
}