import numpy as np
import torch
from scipy.ndimage import binary_fill_holes

# ==========================================================
# Mask Fill Holes —— 性能优化版
#
# 原版每帧：tensor→uint8→PIL→scipy→PIL→RGB→invert→PIL→tensor，
# 中间有 3 次 PIL 对象创建 + 1 次无意义的 RGB 往返转换。
# 优化后：
#   - 整个 batch 只做一次 tensor→numpy 同步、一次 numpy→tensor
#   - 去掉全部 PIL 对象和无意义 RGB 转换（fill→invert 直接算）
#   - 核心算法仍是 scipy binary_fill_holes（C 实现，无法更优）
#
# 语义完全对齐原版，包括一个隐蔽细节：
#   原版 _mask2pil 先把 float 直接 astype('uint8')（截断到 0/1），
#   再 *255，等价于 binary = (mask >= 1.0)。本版保留同样阈值。
#   注意：原版 fill_region 的 ImageOps.invert 与 _pil2mask 的 1- 是
#   双重反转，互相抵消 —— 最终输出就是 filled 本身（已数值核验）。
# ==========================================================


class wcx_MaskFillHoles:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "遮罩": ("MASK",),  # 中文输入命名，直观友好
            }
        }

    RETURN_TYPES = ("MASK",)
    RETURN_NAMES = ("遮罩",)       # 保持中英文输出命名习惯的一致性
    FUNCTION = "fill_holes"
    CATEGORY = "Practical-Tools/Mask"     # 统一归入 WCX 节点树下的 mask 分类

    def fill_holes(self, 遮罩):
        # 针对单张 MASK 或 MASK 批处理（Batch）进行遍历处理
        if 遮罩.ndim == 3:
            batch_np = 遮罩.cpu().numpy()
            filled = np.empty(batch_np.shape, dtype=np.float32)

            for i in range(batch_np.shape[0]):
                # 等价于原版 uint8 截断后的 (mask > 0)
                binary = batch_np[i] >= 1.0
                filled[i] = binary_fill_holes(binary)

            # 原版 invert + _pil2mask(1-) 双重反转互相抵消 → 输出 = filled
            return (torch.from_numpy(filled),)
        else:
            # 单张 Mask 处理
            mask_np = 遮罩.cpu().numpy()
            binary = mask_np >= 1.0
            filled = binary_fill_holes(binary)
            return (torch.from_numpy(filled.astype(np.float32)),)


# ==========================================================
# WCX 专属节点注册与显示名称映射
# ==========================================================
NODE_CLASS_MAPPINGS = {
    "wcx_MaskFillHoles": wcx_MaskFillHoles
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_MaskFillHoles": "Mask Fill Holes"
}
