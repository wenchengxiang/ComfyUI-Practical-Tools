import torch
import numpy as np
from PIL import Image, ImageOps, ImageFilter

# ==========================================
# 内部公共工具函数 (已修正健全性)
# ==========================================
def tensor2pil(image):
    # 彻底杜绝 float 转 int 阵列的兼容报错，规范为标准的 uint8 格式
    return Image.fromarray(np.clip(image.cpu().numpy() * 255.0, 0, 255).astype(np.uint8)).convert("RGB")

def pil2tensor(image):
    # 规范返回 (1, H, W, C) 标准 ComfyUI 图像张量
    return torch.from_numpy(np.array(image).astype(np.float32) / 255.0).unsqueeze(0)


# ==========================================
# 节点 A：带遮罩智能裁剪 (修复版)
# ==========================================
class ImageCropByMask:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(self):
        return {
            'required': {
                'image': ('IMAGE',), 
                'mask': ('MASK',), 
                'padding_left': ('INT', {'default': 64, 'min': 0, 'max': 999999}), 
                'padding_right': ('INT', {'default': 64, 'min': 0, 'max': 999999}), 
                'padding_top': ('INT', {'default': 64, 'min': 0, 'max': 999999}), 
                'padding_bottom': ('INT', {'default': 64, 'min': 0, 'max': 999999})
            }
        }
        
    RETURN_TYPES = ('IMAGE', 'IMAGE_BOUNDS')
    FUNCTION = 'bounded_image_crop_with_mask'
    CATEGORY = 'WCXnodes/utils'

    def bounded_image_crop_with_mask(self, image, mask, padding_left, padding_right, padding_top, padding_bottom):
        image = image.unsqueeze(0) if image.dim() == 3 else image
        mask = mask.unsqueeze(0) if mask.dim() == 2 else mask
        
        mask_len = len(mask)
        cropped_images = []
        all_bounds = []
        
        # 兜底默认边界：万一第一张是全黑，默认取整张图
        last_rmin, last_rmax = 0, image.shape[1] - 1
        last_cmin, last_cmax = 0, image.shape[2] - 1

        for i in range(len(image)):
            mask_idx = i if i < mask_len else 0
            current_mask = mask[mask_idx]
            
            rows = torch.any(current_mask, dim=1)
            cols = torch.any(current_mask, dim=0)
            
            if not torch.any(rows):
                # 纯黑遮罩安全防御：沿用上一次的有效边界
                rmin, rmax, cmin, cmax = last_rmin, last_rmax, last_cmin, last_cmax
            else:
                idx_rows = torch.where(rows)[0]
                idx_cols = torch.where(cols)[0]
                
                rmin, rmax = idx_rows[0].item(), idx_rows[-1].item()
                cmin, cmax = idx_cols[0].item(), idx_cols[-1].item()
                
                rmin = max(rmin - padding_top, 0)
                rmax = min(rmax + padding_bottom, current_mask.shape[0] - 1)
                cmin = max(cmin - padding_left, 0)
                cmax = min(cmax + padding_right, current_mask.shape[1] - 1)
                
                last_rmin, last_rmax, last_cmin, last_cmax = rmin, rmax, cmin, cmax
            
            all_bounds.append([rmin, rmax, cmin, cmax])
            cropped = image[i][rmin:rmax + 1, cmin:cmax + 1, :]
            cropped_images.append(cropped)
            
        return (torch.stack(cropped_images), all_bounds)


# ==========================================
# 节点 B：局部图像混合融合 (修复版)
# ==========================================
class ImageUncropByBound:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(self):
        return {
            'required': {
                'target': ('IMAGE',), 
                'target_bounds': ('IMAGE_BOUNDS',), 
                'source': ('IMAGE',), 
                'blend_factor': ('FLOAT', {'default': 1.0, 'min': 0.0, 'max': 1.0}), 
                'feathering': ('INT', {'default': 16, 'min': 0, 'max': 999999})
            }
        }
        
    RETURN_TYPES = ('IMAGE',)
    FUNCTION = 'bounded_image_blend'
    CATEGORY = 'WCXnodes/utils'

    def bounded_image_blend(self, target, target_bounds, source, blend_factor, feathering):
        target = target.unsqueeze(0) if target.dim() == 3 else target
        source = source.unsqueeze(0) if source.dim() == 3 else source
        
        tgt_len = len(target)
        bounds_len = len(target_bounds)
        src_len = len(source)
        
        tgt_arr = [tensor2pil(tgt) for tgt in target]
        src_arr = [tensor2pil(src) for src in source]
        
        result_tensors = []
        
        for idx in range(src_len):
            src = src_arr[idx]
            
            # 安全配对逻辑，防止多图批次错位崩溃
            tgt_idx = idx if idx < tgt_len else 0
            tgt = tgt_arr[tgt_idx]
            
            bound_idx = idx if idx < bounds_len else 0
            (rmin, rmax, cmin, cmax) = target_bounds[bound_idx]
            
            height = rmax - rmin + 1
            width = cmax - cmin + 1
            
            # 羽化安全防御：防止大羽化在小图上导致负数尺寸崩溃
            current_feathering = min(feathering, width // 2 - 1, height // 2 - 1)
            current_feathering = max(current_feathering, 0)

            if current_feathering > 0:
                inner_mask = Image.new('L', (width - 2 * current_feathering, height - 2 * current_feathering), 255)
                inner_mask = ImageOps.expand(inner_mask, border=current_feathering, fill=0)
                inner_mask = inner_mask.filter(ImageFilter.GaussianBlur(radius=current_feathering))
            else:
                inner_mask = Image.new('L', (width, height), 255)
                
            if blend_factor < 1.0:
                inner_mask = inner_mask.point(lambda p: p * blend_factor)
                
            tgt_mask = Image.new('L', tgt.size, 0)
            tgt_mask.paste(inner_mask, (cmin, rmin))
            
            src_resized = src.resize((width, height), Image.Resampling.LANCZOS)
            src_positioned = Image.new(tgt.mode, tgt.size)
            src_positioned.paste(src_resized, (cmin, rmin))
            
            result = Image.composite(src_positioned, tgt, tgt_mask)
            # 使用 pil2tensor 统一返回 4 维张量并进行合并
            result_tensors.append(pil2tensor(result))
            
        return (torch.cat(result_tensors, dim=0),)


# 注册映射
NODE_CLASS_MAPPINGS = {
    "wcx_ImageCropByMask": ImageCropByMask,
    "wcx_ImageUncropByBound": ImageUncropByBound
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_ImageCropByMask": "Image Crop By Mask",
    "wcx_ImageUncropByBound": "Image Uncrop By Bound"
}