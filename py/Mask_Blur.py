"""Mask Blur —— 基于 OpenCV 的高斯模糊。

原实现：torchvision.transforms.functional.gaussian_blur。
该函数在当前版本（0.25）里会构造完整的 k×k 二维高斯核再整体卷积，
每像素开销 O(k²)，且运行在 CPU 上，1024² 下 blur=32 需 1.5 秒。

现实现：cv2.GaussianBlur，OpenCV 内部做行 / 列分离两趟卷积 + SIMD，
耗时基本不随核大小增长，实测同参数下约 2~3 ms。

为保证与旧节点输出一致：
  - 核：sigma 仍取 blur / 2.0，ksize = 2 * blur + 1，两者生成的核逐项相同；
  - 边界：torch 的 F.pad(mode="reflect") 等价于 OpenCV 的 BORDER_REFLECT_101，
    实测整图最大差异 2.4e-7。
注意不能写成 cv2.BORDER_REFLECT，那是另一种镜像约定（差异可达 0.14）。

依赖：opencv-python
"""

import numpy as np
import torch

try:
    import cv2
except Exception:  # pragma: no cover
    cv2 = None

_INSTALL_HINT = (
    "Mask Blur 需要 OpenCV。请在 ComfyUI 的运行环境中执行：pip install opencv-python"
)


def _as_bchw(mask):
    """把 mask 统一成 [B, C, H, W]。"""
    if mask.dim() == 2:
        return mask.unsqueeze(0).unsqueeze(0)
    if mask.dim() == 3:
        return mask.unsqueeze(1)
    if mask.dim() == 4:
        return mask
    raise ValueError("Mask Blur 不支持 %d 维的 mask" % mask.dim())


class MaskBlur:
    NAME = "Mask Blur"
    CATEGORY = "Practical-Tools/Mask"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "mask": ("MASK",),
                "blur": ("INT", {"default": 4, "min": 0, "max": 999, "step": 1}),
            },
        }

    RETURN_TYPES = ("MASK",)
    RETURN_NAMES = ("mask",)
    FUNCTION = "mask_blur"

    def mask_blur(self, mask, blur):
        x = _as_bchw(mask)

        # 与原实现一致：blur <= 0 时原样返回，最后统一去掉通道维
        if blur <= 0:
            return (x.squeeze(1),)

        if cv2 is None:
            raise RuntimeError(_INSTALL_HINT)

        device = x.device
        dtype = x.dtype
        work_dtype = torch.float64 if dtype == torch.float64 else torch.float32
        np_dtype = np.float64 if work_dtype == torch.float64 else np.float32

        kernel_size = blur * 2 + 1
        sigma = blur / 2.0

        b, c, h, w = x.shape
        src = x.detach().to(work_dtype).cpu().numpy()
        out = np.empty((b, c, h, w), dtype=np_dtype)
        for i in range(b):
            for j in range(c):
                plane = np.ascontiguousarray(src[i, j], dtype=np_dtype)
                out[i, j] = cv2.GaussianBlur(
                    plane,
                    (kernel_size, kernel_size),
                    sigmaX=sigma,
                    sigmaY=sigma,
                    borderType=cv2.BORDER_REFLECT_101,
                )

        result = torch.from_numpy(out).squeeze(1)
        return (result.to(device=device, dtype=dtype),)


# 注册映射
NODE_CLASS_MAPPINGS = {
    "wcx_MaskBlur": MaskBlur,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_MaskBlur": "Mask Blur",
}
