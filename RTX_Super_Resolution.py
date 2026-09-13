import torch
import nvvfx


class wcx_RTXSuperResolution:

    CATEGORY = "Practical-Tools/Image"
    FUNCTION = "upscale"

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("upscaled_images",)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": (
                    "IMAGE",
                ),

                "resize_type": (
                    [
                        "scale by multiplier",
                        "target dimensions",
                    ],
                    {
                        "default": "scale by multiplier",
                    },
                ),

                "scale": (
                    "FLOAT",
                    {
                        "default": 2.0,
                        "min": 1.0,
                        "max": 4.0,
                        "step": 0.01,
                    },
                ),

                "width": (
                    "INT",
                    {
                        "default": 1920,
                        "min": 64,
                        "max": 8192,
                        "step": 8,
                    },
                ),

                "height": (
                    "INT",
                    {
                        "default": 1080,
                        "min": 64,
                        "max": 8192,
                        "step": 8,
                    },
                ),

                "quality": (
                    [
                        "LOW",
                        "MEDIUM",
                        "HIGH",
                        "ULTRA",
                    ],
                    {
                        "default": "ULTRA",
                    },
                ),
            }
        }

    def upscale(
        self,
        images,
        resize_type,
        scale,
        width,
        height,
        quality,
    ):
        _, input_height, input_width, channels = images.shape

        # Determine output resolution
        if resize_type == "scale by multiplier":
            output_width = int(
                input_width * scale
            )
            output_height = int(
                input_height * scale
            )

        elif resize_type == "target dimensions":
            output_width = int(width)
            output_height = int(height)

        else:
            raise ValueError(
                f"Unsupported resize type: {resize_type}"
            )

        # RTX VSR requires dimensions aligned to 8 pixels.
        output_width = max(
            8,
            round(output_width / 8) * 8,
        )

        output_height = max(
            8,
            round(output_height / 8) * 8,
        )

        # Limit the number of pixels processed at once.
        MAX_PIXELS = 1024 * 1024 * 16

        output_pixels = (
            output_width * output_height
        )

        batch_size = max(
            1,
            MAX_PIXELS // output_pixels,
        )

        # NVIDIA VFX quality
        quality_mapping = {
            "LOW": nvvfx.effects.QualityLevel.LOW,
            "MEDIUM": nvvfx.effects.QualityLevel.MEDIUM,
            "HIGH": nvvfx.effects.QualityLevel.HIGH,
            "ULTRA": nvvfx.effects.QualityLevel.ULTRA,
        }

        selected_quality = quality_mapping.get(
            quality,
            nvvfx.effects.QualityLevel.HIGH,
        )

        # RTX Video Super Resolution
        with nvvfx.VideoSuperRes(
            selected_quality
        ) as sr:

            sr.output_width = output_width
            sr.output_height = output_height

            sr.load()

            out_tensor = torch.empty(
                (
                    images.shape[0],
                    output_height,
                    output_width,
                    channels,
                ),
                device=images.device,
                dtype=images.dtype,
            )

            # Process images in batches
            for i in range(
                0,
                images.shape[0],
                batch_size,
            ):
                batch = images[
                    i:i + batch_size
                ]

                batch_cuda = (
                    batch
                    .cuda()
                    .permute(0, 3, 1, 2)
                    .float()
                    .contiguous()
                )

                for j in range(
                    batch_cuda.shape[0]
                ):
                    input_frame = batch_cuda[j]

                    dlpack_out = sr.run(
                        input_frame
                    ).image

                    result = (
                        torch.from_dlpack(
                            dlpack_out
                        )
                        .movedim(0, -1)
                        .unsqueeze(0)
                    )

                    out_tensor[
                        i + j:i + j + 1
                    ] = result

        return (out_tensor,)


NODE_CLASS_MAPPINGS = {
    "wcx_RTXSuperResolution": wcx_RTXSuperResolution,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_RTXSuperResolution": "RTXSuperResolution",
}