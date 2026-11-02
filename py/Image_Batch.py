import math

import torch
import torch.nn.functional as F

# 最多 15 路图像输入（images_0 ... images_14）
_COUNT = 15
_ORDER = {f"images_{i}": i for i in range(_COUNT)}


def _optional_inputs():
    return {name: ("IMAGE",) for name in _ORDER}


def _wh(t):
    # 返回 (宽, 高)，报错信息里按习惯写 宽×高
    return int(t.shape[2]), int(t.shape[1])


def _collect(kwargs):
    items = [(k, v) for k, v in kwargs.items() if v is not None]
    items.sort(key=lambda kv: _ORDER.get(kv[0], 999))
    if not items:
        raise ValueError("Image Batch: 至少需要接入一个图像输入。")
    return items


def _check_channel(name, t, ref_c):
    if t.shape[3] != ref_c:
        raise ValueError(
            f"Image Batch: {name} 的通道数是 {int(t.shape[3])}，基准是 {ref_c}（通道数不一致，无法合并）。"
        )


def _crop_to(t, ref_h, ref_w):
    """居中裁剪到 ref_h × ref_w（要求原图不小于目标）。"""
    _, h, w, _ = t.shape
    y0 = max(0, (h - ref_h) // 2)
    x0 = max(0, (w - ref_w) // 2)
    return t[:, y0:y0 + ref_h, x0:x0 + ref_w, :]


def _resize(t, new_h, new_w):
    """把 (B,H,W,C) 缩放到 new_h × new_w，双线性 + 抗锯齿。"""
    if t.shape[1] == new_h and t.shape[2] == new_w:
        return t
    x = t.permute(0, 3, 1, 2)  # B,C,H,W
    x = F.interpolate(x, size=(new_h, new_w), mode="bilinear", align_corners=False, antialias=True)
    return x.permute(0, 2, 3, 1).contiguous()


def _cover_to(t, ref_h, ref_w):
    """Crop 用：等比缩放到“刚好覆盖”基准尺寸，再把多出的边居中裁掉。

    画面始终被填满，不产生黑边；代价是超出的部分会被切掉。
    """
    _, h, w, _ = t.shape
    if h == ref_h and w == ref_w:
        return t
    scale = max(ref_h / h, ref_w / w)
    new_h = max(ref_h, int(math.ceil(h * scale)))
    new_w = max(ref_w, int(math.ceil(w * scale)))
    t2 = _resize(t, new_h, new_w)
    return _crop_to(t2, ref_h, ref_w)


def _pad_to_aspect(t, ref_aspect):
    """补黑边到目标宽高比：宽了补上下，高了补左右；不裁掉任何内容。"""
    _, h, w, c = t.shape
    if h <= 0 or w <= 0:
        return t
    aspect = w / h
    if abs(aspect - ref_aspect) < 1e-6:
        return t
    if aspect > ref_aspect:
        # 比目标宽 -> 上下补
        new_h = max(h, int(round(w / ref_aspect)))
        pad_total = new_h - h
        top = pad_total // 2
        out = t.new_zeros((t.shape[0], new_h, w, c))
        out[:, top:top + h, :, :] = t
        return out
    # 比目标高 -> 左右补
    new_w = max(w, int(round(h * ref_aspect)))
    pad_total = new_w - w
    left = pad_total // 2
    out = t.new_zeros((t.shape[0], h, new_w, c))
    out[:, :, left:left + w, :] = t
    return out


def _pad_mode_fit(t, ref_h, ref_w):
    """Pad 用：先补到基准宽高比（内容不裁），再缩放到基准尺寸。"""
    if t.shape[1] == ref_h and t.shape[2] == ref_w:
        return t
    ref_aspect = ref_w / ref_h
    tmp = _pad_to_aspect(t, ref_aspect)
    return _resize(tmp, ref_h, ref_w)


class _ImageBatchBase:
    CATEGORY = "Practical-Tools/Image"
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "image_batch"
    # exact: 尺寸必须一致；crop: 缩放+裁切（cover）；pad: 补边+缩放（contain）
    _MODE = "exact"

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}, "optional": _optional_inputs()}

    def image_batch(self, **kwargs):
        items = _collect(kwargs)
        ref_name, ref = items[0]
        ref_h, ref_w = int(ref.shape[1]), int(ref.shape[2])
        ref_c = int(ref.shape[3])

        out = []
        for name, t in items:
            _check_channel(name, t, ref_c)
            if self._MODE == "crop":
                t = _cover_to(t, ref_h, ref_w)
            elif self._MODE == "pad":
                t = _pad_mode_fit(t, ref_h, ref_w)
            elif t.shape[1] != ref_h or t.shape[2] != ref_w:
                ch, cw = _wh(t)
                raise ValueError(
                    f"Image Batch: 输入图像尺寸不一致 —— {name} 是 {ch}×{cw}，"
                    f"基准 {ref_name} 是 {ref_w}×{ref_h}。"
                    f"可改用 Image Batch Crop To First 或 Pad To First。"
                )
            out.append(t)

        return (torch.cat(out, dim=0),)


class wcx_ImageBatch(_ImageBatchBase):
    """尺寸必须完全一致的严格合并。"""

    _MODE = "exact"


class wcx_ImageBatchCropToFirst(_ImageBatchBase):
    """缩放+裁切到第一个非空输入的尺寸：等比放大到刚好覆盖，再居中裁掉多余部分。

    画面始终填满目标尺寸，不出现黑边；超出部分被切掉。
    """

    _MODE = "crop"


class wcx_ImageBatchPadToFirst(_ImageBatchBase):
    """补边+缩放到第一个非空输入的尺寸：先补黑边到目标宽高比（不裁内容），再整体缩放。"""

    _MODE = "pad"


# 节点注册
NODE_CLASS_MAPPINGS = {
    "wcx_ImageBatch": wcx_ImageBatch,
    "wcx_ImageBatchCropToFirst": wcx_ImageBatchCropToFirst,
    "wcx_ImageBatchPadToFirst": wcx_ImageBatchPadToFirst,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_ImageBatch": "Image Batch",
    "wcx_ImageBatchCropToFirst": "Image Batch Crop To First",
    "wcx_ImageBatchPadToFirst": "Image Batch Pad To First",
}
