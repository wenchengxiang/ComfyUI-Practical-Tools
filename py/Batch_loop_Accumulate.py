# Batch_Accumulate.py — wcx 循环累积专用节点（Batchloop Accumulate / wcx_BatchloopAccumulate）
#
# 语义单一：把 item 逐轮"加进" accumulated，输出新 accumulated。
# 专为 For/While 循环设计：循环内每轮把本轮结果累积起来，
# 循环结束后通过 End.valueN 拿到全部轮次的结果。
#
# 行为表（小而确定，绝不报错）：
#   accumulated=None            -> 直接返回 item（首轮不接累积输入）
#   item=None                   -> 直接返回 accumulated
#   latent  + latent            -> 按 batch 维拼接（尺寸自动对齐，batch_index 合并）
#   音频dict + 音频dict          -> 按时间维拼接（采样率/声道自动对齐）
#   tensor  + tensor            -> 按 batch 维拼接（图像语义自动对齐）
#   list    + 任意              -> 追加为元素（不平铺，每轮一个元素）
#   任意    + list              -> 元素前置（[acc] + item）
#   其它    + 其它              -> 收进 [acc, item]（保真，后续自己处理）

import torch
import comfy.utils


class AnyType(str):
    """ComfyUI 万能通配类型"""
    def __ne__(self, __value: object) -> bool:
        return False

    def __eq__(self, __value: object) -> bool:
        return True

    def __str__(self):
        return "*"


any_type = AnyType("*")


class BatchAccumulate:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "item": (any_type, {}),  # 本轮要累积进去的值
            },
            "optional": {
                "accumulated": (any_type, {}),  # 累积值（首轮可不接）
            },
        }

    RETURN_TYPES = (any_type,)
    RETURN_NAMES = ("accumulated",)
    FUNCTION = "accumulate"
    CATEGORY = "Practical-Tools/Logic"

    def accumulate(self, item, accumulated=None):
        # ---- 空值：首轮 / 单侧空 ----
        if accumulated is None:
            return (item,)
        if item is None:
            return (accumulated,)

        # ---- LATENT 拼接（dict 含 samples）----
        if isinstance(accumulated, dict) and isinstance(item, dict) \
                and "samples" in accumulated and "samples" in item:
            return (self._cat_latents(accumulated, item),)

        # ---- 音频拼接（dict 含 waveform + sample_rate）----
        if isinstance(accumulated, dict) and isinstance(item, dict) \
                and "waveform" in accumulated and "waveform" in item:
            return (self._cat_audio(accumulated, item),)

        # ---- torch.Tensor 拼接 ----
        if isinstance(accumulated, torch.Tensor) and isinstance(item, torch.Tensor):
            return (self._cat_tensors(accumulated, item),)

        # ---- list/tuple：追加元素（不平铺）----
        if isinstance(accumulated, list):
            return (accumulated + [item],)
        if isinstance(accumulated, tuple):
            return (accumulated + (item,),)
        if isinstance(item, list):
            return ([accumulated] + item,)
        if isinstance(item, tuple):
            return ((accumulated,) + item,)

        # ---- 其它任意对象：保真收进 list，顺序固定 accumulated -> item ----
        return ([accumulated, item],)

    @staticmethod
    def _cat_latents(a, b):
        """潜变量拼接：samples 按 batch 维 cat，batch_index 合并，尺寸不匹配自动对齐。"""
        out = a.copy()
        s1, s2 = a["samples"], b["samples"]
        if s1.shape[1:] != s2.shape[1:]:
            s2 = comfy.utils.common_upscale(s2, s1.shape[3], s1.shape[2], "bilinear", "center")
        out["samples"] = torch.cat((s1, s2), dim=0)
        idx1 = a.get("batch_index", [x for x in range(s1.shape[0])])
        idx2 = b.get("batch_index", [x for x in range(s2.shape[0])])
        out["batch_index"] = list(idx1) + list(idx2)
        return out

    @staticmethod
    def _cat_audio(a, b):
        """音频拼接：沿时间维 cat，采样率自动对齐（需 torchaudio 时重采样），声道自动对齐。"""
        out = a.copy()
        wa, wb = a["waveform"], b["waveform"]
        ra, rb = a.get("sample_rate"), b.get("sample_rate")
        # 采样率对齐
        if ra is not None and rb is not None and ra != rb:
            try:
                import torchaudio
                wb = torchaudio.functional.resample(wb, rb, ra)
            except ImportError:
                raise ValueError(
                    "[BatchAccumulate] 音频 sample_rate 不一致 (%s vs %s) 且环境无 torchaudio，无法重采样"
                    % (ra, rb)
                )
        # 统一为 [C, S]（1D->[1,S]；3D->[B,C,S] 取首段，累积语义每轮单段）
        def as_cs(w):
            if w.dim() == 1:
                return w.unsqueeze(0)
            if w.dim() == 3:
                return w[0]
            return w
        wa2, wb2 = as_cs(wa), as_cs(wb)
        # 声道对齐：少声道重复到多声道
        c = max(wa2.shape[0], wb2.shape[0])
        if wa2.shape[0] < c:
            wa2 = wa2.repeat(c, 1)
        if wb2.shape[0] < c:
            wb2 = wb2.repeat(c, 1)
        out["waveform"] = torch.cat((wa2, wb2), dim=-1)
        out["sample_rate"] = ra if ra is not None else rb
        return out

    @staticmethod
    def _cat_tensors(a, b):
        """图像/任意 tensor 按 batch 维拼接，尺寸不匹配按图像语义对齐（NHWC）。"""
        if a.shape[1:] != b.shape[1:]:
            b = comfy.utils.common_upscale(
                b.movedim(-1, 1), a.shape[2], a.shape[1], "bilinear", "center"
            ).movedim(1, -1)
        return torch.cat((a, b), 0)


NODE_CLASS_MAPPINGS = {
    "wcx_BatchloopAccumulate": BatchAccumulate,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_BatchloopAccumulate": "Batchloop Accumulate",
}
