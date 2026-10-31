"""Mask Grow —— 基于 OpenCV 的矩形核膨胀 / 腐蚀。

原实现：F.max_pool2d(kernel=k, stride=1, padding=k//2)，每像素开销 O(k²)；
PyTorch 的 CPU 后端对 max_pool2d 没有矩阵化路径，1024² 下 grow=16 需 6 秒、
grow=32 需 21 秒。

现实现：OpenCV 的形态学对矩形结构元做了行 / 列分离优化，复杂度 O(k)，
耗时主要受内存带宽限制而不是核大小，实测同参数下约 1~3 ms 且几乎不随 k 增长。

语义与 max_pool2d 版本一致：
  - 正方形核（半径 |grow|），不是核心 GrowMask 的菱形；
  - 边界不外扩：dilate 用 -DBL_MAX、erode 用 +DBL_MAX 作为边界常量，
    等价于 max_pool2d 的 -inf padding。

依赖：opencv-python
"""

import numpy as np
import torch

try:
    import cv2
except Exception:  # pragma: no cover
    cv2 = None

_INSTALL_HINT = (
    "Mask Grow 需要 OpenCV。请在 ComfyUI 的运行环境中执行：pip install opencv-python"
)


def _as_bchw(mask):
    """把 mask 统一成 [B, C, H, W]。"""
    if mask.dim() == 2:
        return mask.unsqueeze(0).unsqueeze(0)
    if mask.dim() == 3:
        return mask.unsqueeze(1)
    if mask.dim() == 4:
        return mask
    raise ValueError("Mask Grow 不支持 %d 维的 mask" % mask.dim())


class MaskGrow:
    NAME = "Mask Grow"
    CATEGORY = "Practical-Tools/Mask"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "mask": ("MASK",),
                "grow": ("INT", {"default": 4, "min": -999, "max": 999, "step": 1}),
            },
        }

    RETURN_TYPES = ("MASK",)
    RETURN_NAMES = ("mask",)
    FUNCTION = "mask_grow"

    def mask_grow(self, mask, grow):
        x = _as_bchw(mask)

        # 与原实现一致：grow == 0 时原样返回，最后统一去掉通道维
        if grow == 0:
            return (x.squeeze(1),)

        if cv2 is None:
            raise RuntimeError(_INSTALL_HINT)

        device = x.device
        dtype = x.dtype
        work_dtype = torch.float64 if dtype == torch.float64 else torch.float32
        np_dtype = np.float64 if work_dtype == torch.float64 else np.float32

        k = abs(grow) * 2 + 1
        kernel = np.ones((k, k), np.uint8)
        op = cv2.dilate if grow > 0 else cv2.erode

        b, c, h, w = x.shape
        src = x.detach().to(work_dtype).cpu().numpy()
        out = np.empty((b, c, h, w), dtype=np_dtype)
        for i in range(b):
            for j in range(c):
                plane = np.ascontiguousarray(src[i, j], dtype=np_dtype)
                out[i, j] = op(plane, kernel)

        result = torch.from_numpy(out).squeeze(1)
        return (result.to(device=device, dtype=dtype),)


# 注册映射
NODE_CLASS_MAPPINGS = {
    "wcx_MaskGrow": MaskGrow,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_MaskGrow": "Mask Grow",
}
