import torch
import torch.nn.functional as F


def _gaussian_kernel(kernel_size, sigma, device, dtype):
    """生成一维高斯核"""
    coords = torch.arange(kernel_size, device=device, dtype=dtype) - (kernel_size - 1) / 2.0
    g = torch.exp(-(coords ** 2) / (2 * sigma ** 2))
    return g / g.sum()


def _gaussian_blur_2d(noise, kernel_size, sigma):
    """对 BHWC 格式的噪点进行二维高斯模糊（可分离卷积）"""
    if kernel_size <= 1:
        return noise
    b, h, w, c = noise.shape
    device, dtype = noise.device, noise.dtype

    # 生成一维高斯核
    k = _gaussian_kernel(kernel_size, sigma, device, dtype)

    # 转为 BCHW 格式
    x = noise.movedim(-1, 1)  # B, C, H, W

    # 水平方向卷积
    k_h = k.view(1, 1, 1, -1).expand(c, 1, 1, -1)
    pad_h = kernel_size // 2
    x = F.conv2d(x, k_h, padding=(0, pad_h), groups=c)

    # 垂直方向卷积
    k_v = k.view(1, 1, -1, 1).expand(c, 1, -1, 1)
    pad_v = kernel_size // 2
    x = F.conv2d(x, k_v, padding=(pad_v, 0), groups=c)

    return x.movedim(1, -1)  # B, H, W, C


class wcx_AddNoise:

    CATEGORY = "Practical-Tools/Image"
    FUNCTION = "add_noise"

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("noisy_images",)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
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
                "noise_color": (
                    [
                        "color",
                        "monochrome",
                        "match_image",
                    ],
                    {
                        "default": "color",
                        "tooltip": "color=彩色噪点，monochrome=灰度噪点，match_image=噪点颜色跟随原图",
                    },
                ),
                "noise_type": (
                    [
                        "gaussian",
                        "salt_pepper",
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

    def add_noise(self, images, noise_amount, opacity, noise_size, noise_color, noise_type, seed):
        if noise_amount <= 0.0 or opacity <= 0.0:
            return (images,)

        alpha = images[..., 3:4] if images.shape[-1] > 3 else None
        rgb = images[..., :3].clone()
        b, h, w, c = rgb.shape

        generator = torch.Generator(device=images.device)
        generator.manual_seed(seed)

        # 灰度和匹配原图模式生成单通道随机值，彩色模式生成三通道
        rand_channels = 1 if noise_color in ("monochrome", "match_image") else c

        def _expand_noise(noise_single):
            """单通道扩展到三通道"""
            if noise_single.shape[-1] == 1:
                return noise_single.expand(-1, -1, -1, c).contiguous()
            return noise_single

        def _blur_noise(noise):
            """用高斯模糊控制噪点颗粒大小"""
            if noise_size <= 1:
                return noise
            # 核大小和 sigma 根据 noise_size 计算
            kernel_size = noise_size * 2 + 1
            sigma = noise_size * 0.5
            return _gaussian_blur_2d(noise, kernel_size, sigma)

        def _get_rgb_dir(rgb):
            """计算原图颜色方向（亮度归一化），灰色=(1,1,1)，纯红=(~3.3,0,0)"""
            luminance = (0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]).unsqueeze(-1)
            return rgb / (luminance + 1e-8)

        def _apply_noise(rgb, noise, noise_amount, noise_color):
            """叠加噪点"""
            if noise_color == "match_image":
                # 只取正噪点（只加亮不减暗），乘法叠加，颜色严格跟随原图
                # 暗部自然颗粒少，亮部颗粒明显，模拟胶片颗粒特性，不会出现黑色脏点
                noise_pos = noise.clamp(min=0.0)
                return rgb * (1.0 + noise_pos * noise_amount)
            else:
                return rgb + noise * noise_amount

        if noise_type == "gaussian":
            noise = torch.randn(
                (b, h, w, rand_channels),
                generator=generator, device=images.device, dtype=rgb.dtype,
            )
            noise = _expand_noise(noise)
            noise = _blur_noise(noise)
            # 模糊后归一化标准差，保持噪点强度一致
            if noise_size > 1:
                noise = noise / (noise.std() + 1e-8)
            noisy = _apply_noise(rgb, noise, noise_amount, noise_color)

        elif noise_type == "salt_pepper":
            rand = torch.rand(
                (b, h, w, rand_channels),
                generator=generator, device=images.device, dtype=rgb.dtype,
            )
            rand = _expand_noise(rand)
            rand = _blur_noise(rand)
            # 模糊后归一化到 [0, 1]
            if noise_size > 1:
                rand = (rand - rand.min()) / (rand.max() - rand.min() + 1e-8)

            if noise_color == "match_image":
                # 只加盐点（加亮），不加椒点（不减暗），颜色跟随原图
                noisy = rgb.clone()
                salt_mask = rand < noise_amount
                noisy[salt_mask] = (rgb * (1.0 + noise_amount))[salt_mask]
            else:
                noisy = rgb.clone()
                salt_mask = rand < (noise_amount * 0.5)
                noisy[salt_mask] = 1.0
                pepper_mask = rand > (1.0 - noise_amount * 0.5)
                noisy[pepper_mask] = 0.0

        elif noise_type == "uniform":
            noise = torch.rand(
                (b, h, w, rand_channels),
                generator=generator, device=images.device, dtype=rgb.dtype,
            )
            noise = noise * 2.0 - 1.0  # [-1, 1]
            noise = _expand_noise(noise)
            noise = _blur_noise(noise)
            # 模糊后归一化
            if noise_size > 1:
                noise = noise / (noise.abs().max() + 1e-8)
            noisy = _apply_noise(rgb, noise, noise_amount, noise_color)

        else:
            raise ValueError(f"Unknown noise type: {noise_type}")

        # 裁剪到 [0, 1]
        noisy = noisy.clamp(0.0, 1.0)

        # 用 opacity 混合原图和噪点图
        if opacity < 1.0:
            noisy = rgb * (1.0 - opacity) + noisy * opacity

        if alpha is not None:
            noisy = torch.cat((noisy, alpha), dim=-1)

        return (noisy,)


NODE_CLASS_MAPPINGS = {
    "wcx_AddNoise": wcx_AddNoise,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_AddNoise": "Image Add Noise",
}
