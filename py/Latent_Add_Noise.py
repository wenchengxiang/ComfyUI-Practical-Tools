import torch
import torch.nn.functional as F


def _gaussian_kernel(kernel_size, sigma, device, dtype):
    """生成一维高斯核"""
    coords = torch.arange(kernel_size, device=device, dtype=dtype) - (kernel_size - 1) / 2.0
    g = torch.exp(-(coords ** 2) / (2 * sigma ** 2))
    return g / g.sum()


def _gaussian_blur_2d(noise, kernel_size, sigma):
    """对 BCHW 格式的 latent 噪点进行二维高斯模糊（可分离卷积）"""
    if kernel_size <= 1:
        return noise
    b, c, h, w = noise.shape
    device, dtype = noise.device, noise.dtype

    k = _gaussian_kernel(kernel_size, sigma, device, dtype)

    # 水平方向卷积
    k_h = k.view(1, 1, 1, -1).expand(c, 1, 1, -1)
    pad_h = kernel_size // 2
    noise = F.conv2d(noise, k_h, padding=(0, pad_h), groups=c)

    # 垂直方向卷积
    k_v = k.view(1, 1, -1, 1).expand(c, 1, -1, 1)
    pad_v = kernel_size // 2
    noise = F.conv2d(noise, k_v, padding=(pad_v, 0), groups=c)

    return noise


class wcx_LatentAddNoise:

    CATEGORY = "Practical-Tools/Latent"
    FUNCTION = "add_noise"

    RETURN_TYPES = ("LATENT",)
    RETURN_NAMES = ("latent",)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "latent": ("LATENT",),
                "noise_amount": (
                    "FLOAT",
                    {
                        "default": 0.1,
                        "min": 0.0,
                        "max": 1.0,
                        "step": 0.01,
                        "tooltip": "噪点强度，0=无噪点，1=最大噪点",
                    },
                ),
                "opacity": (
                    "FLOAT",
                    {
                        "default": 1.0,
                        "min": 0.0,
                        "max": 1.0,
                        "step": 0.01,
                        "tooltip": "噪点不透明度，0=原图，1=完全叠加噪点",
                    },
                ),
                "noise_size": (
                    "INT",
                    {
                        "default": 1,
                        "min": 1,
                        "max": 64,
                        "step": 1,
                        "tooltip": "噪点颗粒大小，1=像素级细噪点，值越大颗粒越粗（高斯模糊）",
                    },
                ),
                "noise_type": (
                    [
                        "gaussian",
                        "uniform",
                    ],
                    {
                        "default": "gaussian",
                    },
                ),
                "seed": (
                    "INT",
                    {
                        "default": 0,
                        "min": 0,
                        "max": 0xFFFFFFFFFFFFFFFF,
                    },
                ),
            }
        }

    def add_noise(self, latent, noise_amount, opacity, noise_size, noise_type, seed):
        if noise_amount <= 0.0 or opacity <= 0.0:
            return (latent,)

        # latent 格式: {"samples": Tensor(B, C, H, W)}
        samples = latent["samples"].clone()
        b, c, h, w = samples.shape

        generator = torch.Generator(device=samples.device)
        generator.manual_seed(seed)

        def _blur_noise(noise):
            """用高斯模糊控制噪点颗粒大小"""
            if noise_size <= 1:
                return noise
            kernel_size = noise_size * 2 + 1
            sigma = noise_size * 0.5
            return _gaussian_blur_2d(noise, kernel_size, sigma)

        if noise_type == "gaussian":
            noise = torch.randn(
                (b, c, h, w),
                generator=generator, device=samples.device, dtype=samples.dtype,
            )
            noise = _blur_noise(noise)
            # 模糊后归一化标准差，保持噪点强度一致
            if noise_size > 1:
                noise = noise / (noise.std() + 1e-8)
            noisy = samples + noise * noise_amount

        elif noise_type == "uniform":
            noise = torch.rand(
                (b, c, h, w),
                generator=generator, device=samples.device, dtype=samples.dtype,
            )
            noise = noise * 2.0 - 1.0  # [-1, 1]
            noise = _blur_noise(noise)
            # 模糊后归一化
            if noise_size > 1:
                noise = noise / (noise.abs().max() + 1e-8)
            noisy = samples + noise * noise_amount

        else:
            raise ValueError(f"Unknown noise type: {noise_type}")

        # 用 opacity 混合原图和噪点图
        if opacity < 1.0:
            noisy = samples * (1.0 - opacity) + noisy * opacity

        return ({"samples": noisy},)


NODE_CLASS_MAPPINGS = {
    "wcx_LatentAddNoise": wcx_LatentAddNoise,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_LatentAddNoise": "Latent Add Noise",
}
