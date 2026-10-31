import torch
import torch.nn.functional as F
import nvvfx
import comfy.model_management

MAX_BATCH_PIXELS = 1024 * 1024 * 16
VSR_QUALITY_OPTIONS = list(nvvfx.QualityLevel.__members__)


def get_effect_device():
    device = comfy.model_management.get_torch_device()
    if device.type != "cuda":
        raise RuntimeError("NVIDIA RTX Video Effects require a CUDA device.")
    device_index = device.index if device.index is not None else torch.cuda.current_device()
    return device, device_index


def pack_rgb10a2(image):
    rgb = image.clamp(0.0, 1.0).mul(1023.0).round().to(torch.int32)
    packed = rgb[..., 0] | (rgb[..., 1] << 10) | (rgb[..., 2] << 20) | -1073741824
    return packed.view(torch.uint32).contiguous()


def unpack_rgb10a2(packed):
    packed = packed.view(torch.int32)
    red = packed.bitwise_and(0x3FF)
    green = packed.bitwise_right_shift(10).bitwise_and(0x3FF)
    blue = packed.bitwise_right_shift(20).bitwise_and(0x3FF)
    return torch.stack((red, green, blue), dim=-1).to(torch.float32).div_(1023.0)


class wcx_RTXSuperResolution:

    CATEGORY = "Practical-Tools/Image"
    FUNCTION = "upscale"

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("upscaled_images",)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
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
                    VSR_QUALITY_OPTIONS,
                    {
                        "default": "ULTRA",
                    },
                ),
                "strength": (
                    "FLOAT",
                    {
                        "default": 1.0,
                        "min": 0.0,
                        "max": 1.0,
                        "step": 0.01,
                    },
                ),
                "image_encoding": (
                    [
                        "8-bit RGB",
                        "10-bit RGB (RGB10A2)",
                    ],
                    {
                        "default": "8-bit RGB",
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
        strength=1.0,
        image_encoding="8-bit RGB",
    ):
        alpha = images[..., 3:4] if images.shape[-1] > 3 else None
        images = images[..., :3]
        b, h, w, c = images.shape

        # Determine output resolution
        if resize_type == "scale by multiplier":
            output_width = int(w * scale)
            output_height = int(h * scale)
        elif resize_type == "target dimensions":
            output_width = int(width)
            output_height = int(height)
        else:
            raise ValueError(f"Unsupported resize type: {resize_type}")

        # DENOISE and DEBLUR modes keep original resolution
        if quality.startswith(("DENOISE_", "DEBLUR_")):
            output_width = w
            output_height = h
        else:
            output_width = max(8, round(output_width / 8) * 8)
            output_height = max(8, round(output_height / 8) * 8)

        output = torch.empty(
            (b, output_height, output_width, c),
            device=images.device,
            dtype=images.dtype,
        )

        device, device_index = get_effect_device()
        batch_size = max(1, MAX_BATCH_PIXELS // (output_width * output_height))

        use_10bit = image_encoding == "10-bit RGB (RGB10A2)"
        nvvfx_encoding = nvvfx.ImageEncoding.RGB10A2 if use_10bit else nvvfx.ImageEncoding.RGB8

        with torch.cuda.device(device), nvvfx.VideoSuperRes(
            quality=nvvfx.QualityLevel[quality],
            strength=strength,
            device=device_index,
            image_encoding=nvvfx_encoding,
        ) as effect:
            effect.output_width = output_width
            effect.output_height = output_height
            effect.load()

            for i in range(0, images.shape[0], batch_size):
                batch = images[i:i + batch_size]
                batch_cuda = batch.to(device=device, dtype=torch.float32)
                if use_10bit:
                    batch_cuda = pack_rgb10a2(batch_cuda)
                else:
                    batch_cuda = batch_cuda.movedim(-1, 1).contiguous()

                for j, frame in enumerate(batch_cuda):
                    dlpack_out = effect.run(frame).image
                    result = torch.from_dlpack(dlpack_out).clone()
                    if use_10bit:
                        result = unpack_rgb10a2(result)
                    else:
                        result = result.movedim(0, -1)
                    output[i + j].copy_(result)

        # Upscale alpha channel if present
        if alpha is not None:
            upscaled_alpha = F.interpolate(
                alpha.movedim(-1, 1),
                size=(output_height, output_width),
                mode="bilinear",
                align_corners=False,
            ).movedim(1, -1)
            output = torch.cat((output, upscaled_alpha), dim=-1)

        return (output,)


NODE_CLASS_MAPPINGS = {
    "wcx_RTXSuperResolution": wcx_RTXSuperResolution,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_RTXSuperResolution": "RTX Super Resolution",
}
