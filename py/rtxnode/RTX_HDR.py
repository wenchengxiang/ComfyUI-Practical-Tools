import math
import torch
import nvvfx
import comfy.model_management

PQ_M1 = 2610 / 16384
PQ_M2 = 2523 / 4096 * 128
PQ_C1 = 3424 / 4096
PQ_C2 = 2413 / 4096 * 32
PQ_C3 = 2392 / 4096 * 32

HLG_A = 0.17883277
HLG_B = 1 - 4 * HLG_A
HLG_C = 0.5 - HLG_A * math.log(4 * HLG_A)


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


def pq_to_hlg(image, peak_luminance):
    pq = image.clamp(0.0, 1.0).pow(1.0 / PQ_M2)
    display_light = ((pq.sub(PQ_C1).clamp_min(0.0) / (PQ_C2 - PQ_C3 * pq)) ** (1.0 / PQ_M1)) * 10000.0
    display_light.clamp_(max=peak_luminance)

    display_luminance = 0.2627 * display_light[..., 0] + 0.6780 * display_light[..., 1] + 0.0593 * display_light[..., 2]
    system_gamma = 1.2 + 0.42 * math.log10(peak_luminance / 1000.0)
    luminance_ratio = (display_luminance / peak_luminance).clamp_min(torch.finfo(display_light.dtype).eps)
    scene_light = (display_light / peak_luminance) * luminance_ratio.unsqueeze(-1).pow((1.0 - system_gamma) / system_gamma)
    scene_light.clamp_(0.0, 1.0)

    low = torch.sqrt(3.0 * scene_light)
    high = HLG_A * torch.log((12.0 * scene_light - HLG_B).clamp_min(torch.finfo(scene_light.dtype).eps)) + HLG_C
    return torch.where(scene_light <= 1.0 / 12.0, low, high)


class wcx_RTXHDR:

    CATEGORY = "Practical-Tools/Image"
    FUNCTION = "apply_hdr"

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("hdr_images",)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
                "contrast": (
                    "INT",
                    {
                        "default": 100,
                        "min": 0,
                        "max": 200,
                    },
                ),
                "saturation": (
                    "INT",
                    {
                        "default": 100,
                        "min": 0,
                        "max": 200,
                    },
                ),
                "middle_gray": (
                    "INT",
                    {
                        "default": 50,
                        "min": 10,
                        "max": 100,
                        "tooltip": "Middle-grey reference level.",
                    },
                ),
                "luminance": (
                    "INT",
                    {
                        "default": 650,
                        "min": 400,
                        "max": 2000,
                        "tooltip": "Target HDR display peak luminance in nits.",
                    },
                ),
                "debanding": (
                    "BOOLEAN",
                    {
                        "default": True,
                        "tooltip": "Apply the SDK's DL-Debander pass.",
                    },
                ),
                "output_colorspace": (
                    [
                        "HDR",
                        "HDR PQ",
                    ],
                    {
                        "default": "HDR",
                    },
                ),
            }
        }

    def apply_hdr(
        self,
        images,
        contrast,
        saturation,
        middle_gray,
        luminance,
        debanding,
        output_colorspace="HDR",
    ):
        alpha = images[..., 3:4] if images.shape[-1] > 3 else None
        images = images[..., :3]
        device, device_index = get_effect_device()
        output = torch.empty(images.shape, device=images.device, dtype=torch.float32)

        with torch.cuda.device(device), nvvfx.TrueHDR(
            contrast=contrast,
            saturation=saturation,
            middle_gray=middle_gray,
            luminance=luminance,
            debanding_off=int(not debanding),
            device=device_index,
        ) as effect:
            effect.load()
            for i, image in enumerate(images):
                image_cuda = image.to(device=device, dtype=torch.float32)
                packed = pack_rgb10a2(image_cuda)
                result = effect.run(packed)
                hdr_image = unpack_rgb10a2(torch.from_dlpack(result.image).clone())
                if output_colorspace == "HDR":
                    hdr_image = pq_to_hlg(hdr_image, luminance)
                output[i].copy_(hdr_image)

        if alpha is not None:
            output = torch.cat((output, alpha.to(dtype=output.dtype)), dim=-1)

        return (output,)


NODE_CLASS_MAPPINGS = {
    "wcx_RTXHDR": wcx_RTXHDR,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_RTXHDR": "RTX HDR",
}
