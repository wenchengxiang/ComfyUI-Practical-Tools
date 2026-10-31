import torch
import nvvfx
import comfy.model_management


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


def prepare_frame(image, device, use_10bit):
    image = image.to(device=device, dtype=torch.float32)
    if use_10bit:
        return pack_rgb10a2(image)
    return image.movedim(-1, 0).contiguous()


def copy_effect_output(dlpack_output, destination, use_10bit):
    output = torch.from_dlpack(dlpack_output).clone()
    if use_10bit:
        output = unpack_rgb10a2(output)
    else:
        output = output.movedim(0, -1)
    destination.copy_(output)


class wcx_RTXFrameGeneration:

    CATEGORY = "Practical-Tools/Video"
    FUNCTION = "generate_frames"

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("interpolated_images",)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
                "generation_type": (
                    [
                        "frame rate multiplier",
                        "specific timestep",
                    ],
                    {
                        "default": "frame rate multiplier",
                    },
                ),
                "multiplier": (
                    "INT",
                    {
                        "default": 2,
                        "min": 2,
                        "max": 16,
                        "tooltip": "Output frame-rate multiplier.",
                    },
                ),
                "timestep": (
                    "FLOAT",
                    {
                        "default": 0.5,
                        "min": 0.01,
                        "max": 0.99,
                        "step": 0.01,
                        "tooltip": "Position between each adjacent input pair.",
                    },
                ),
                "mode": (
                    [
                        "LOW",
                        "MEDIUM",
                        "HIGH",
                    ],
                    {
                        "default": "MEDIUM",
                    },
                ),
                "automatic_shot_change_detection": (
                    "BOOLEAN",
                    {
                        "default": True,
                    },
                ),
                "shot_change": (
                    "BOOLEAN",
                    {
                        "default": False,
                        "tooltip": "Mark every submitted pair as a shot change. Useful when processing a single pair.",
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

    def generate_frames(
        self,
        images,
        generation_type,
        multiplier=2,
        timestep=0.5,
        mode="MEDIUM",
        automatic_shot_change_detection=True,
        shot_change=False,
        image_encoding="8-bit RGB",
    ):
        images = images[..., :3]
        if images.shape[0] < 2:
            return (images,)

        if generation_type == "frame rate multiplier":
            gen_multiplier = multiplier
            generated_per_pair = multiplier - 1
        elif generation_type == "specific timestep":
            gen_multiplier = 2
            generated_per_pair = 1
        else:
            raise ValueError(f"Unsupported generation type: {generation_type}")

        output_count = (images.shape[0] - 1) * (generated_per_pair + 1) + 1
        output = torch.empty((output_count, *images.shape[1:]), device=images.device, dtype=images.dtype)
        output[0].copy_(images[0])

        _, height, width, _ = images.shape
        device, device_index = get_effect_device()
        use_10bit = image_encoding == "10-bit RGB (RGB10A2)"
        nvvfx_encoding = nvvfx.ImageEncoding.RGB10A2 if use_10bit else nvvfx.ImageEncoding.RGB8

        with torch.cuda.device(device), nvvfx.VideoFrameGeneration(
            mode=nvvfx.VideoFrameGeneration.Mode[mode],
            automatic_shot_change_detection_enabled=automatic_shot_change_detection,
            device=device_index,
            image_encoding=nvvfx_encoding,
        ) as effect:
            effect.input_width = width
            effect.input_height = height
            effect.frame_multiplier = gen_multiplier
            effect.load()

            output_index = 1
            previous_frame = prepare_frame(images[0], device, use_10bit)
            for current_image in images[1:]:
                current_frame = prepare_frame(current_image, device, use_10bit)
                if generation_type == "frame rate multiplier":
                    for frame_index in range(1, gen_multiplier):
                        result = effect.run(
                            previous_frame,
                            current_frame,
                            frame_index=frame_index,
                            shot_change=shot_change,
                        )
                        copy_effect_output(result.image, output[output_index], use_10bit)
                        output_index += 1
                else:
                    result = effect.run_at_timestep(
                        previous_frame,
                        current_frame,
                        timestep,
                        shot_change=shot_change,
                    )
                    copy_effect_output(result.image, output[output_index], use_10bit)
                    output_index += 1

                output[output_index].copy_(current_image)
                output_index += 1
                previous_frame = current_frame

        return (output,)


NODE_CLASS_MAPPINGS = {
    "wcx_RTXFrameGeneration": wcx_RTXFrameGeneration,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_RTXFrameGeneration": "RTX Frame Generation",
}
