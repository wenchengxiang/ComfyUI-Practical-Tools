import torch
from nodes import MAX_RESOLUTION

class wcx_ImageTile:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "图像": ("IMAGE",),
                "行数": ("INT", { "default": 2, "min": 1, "max": 256, "step": 1 }),
                "列数": ("INT", { "default": 2, "min": 1, "max": 256, "step": 1 }),
                "重叠比例": ("FLOAT", { "default": 0, "min": 0, "max": 0.5, "step": 0.01 }),
                "重叠像素_横向": ("INT", { "default": 0, "min": 0, "max": MAX_RESOLUTION // 2, "step": 1 }),
                "重叠像素_纵向": ("INT", { "default": 0, "min": 0, "max": MAX_RESOLUTION // 2, "step": 1 }),
            }
        }

    RETURN_TYPES = ("IMAGE", "INT", "INT", "INT", "INT")
    RETURN_NAMES = ("切片批次", "切片宽度", "切片高度", "重叠横向", "重叠纵向")
    FUNCTION = "execute"
    CATEGORY = "WCXnodes/image"

    def execute(self, 图像, 行数, 列数, 重叠比例, 重叠像素_横向, 重叠像素_纵向):
        h, w = 图像.shape[1:3]
        tile_h = h // 行数
        tile_w = w // 列数
        h = tile_h * 行数
        w = tile_w * 列数
        overlap_h = int(tile_h * 重叠比例) + 重叠像素_纵向
        overlap_w = int(tile_w * 重叠比例) + 重叠像素_横向

        # 限制重叠区最大为切片大小的一半
        overlap_h = min(tile_h // 2, overlap_h)
        overlap_w = min(tile_w // 2, overlap_w)

        if 行数 == 1:
            overlap_h = 0
        if 列数 == 1:
            overlap_w = 0
        
        tiles = []
        for i in range(行数):
            for j in range(列数):
                y1 = i * tile_h
                x1 = j * tile_w

                if i > 0:
                    y1 -= overlap_h
                if j > 0:
                    x1 -= overlap_w

                y2 = y1 + tile_h + overlap_h
                x2 = x1 + tile_w + overlap_w

                if y2 > h:
                    y2 = h
                    y1 = y2 - tile_h - overlap_h
                if x2 > w:
                    x2 = w
                    x1 = x2 - tile_w - overlap_w

                tiles.append(图像[:, y1:y2, x1:x2, :])
        tiles = torch.cat(tiles, dim=0)

        return (tiles, tile_w + overlap_w, tile_h + overlap_h, overlap_w, overlap_h)


class wcx_ImageUntile:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "切片批次": ("IMAGE",),
                "重叠横向": ("INT", { "default": 0, "min": 0, "max": MAX_RESOLUTION // 2, "step": 1 }),
                "重叠纵向": ("INT", { "default": 0, "min": 0, "max": MAX_RESOLUTION // 2, "step": 1 }),
                "行数": ("INT", { "default": 2, "min": 1, "max": 256, "step": 1 }),
                "列数": ("INT", { "default": 2, "min": 1, "max": 256, "step": 1 }),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("图像",)
    FUNCTION = "execute"
    CATEGORY = "WCXnodes/image"

    def execute(self, 切片批次, 重叠横向, 重叠纵向, 行数, 列数):
        tile_h, tile_w = 切片批次.shape[1:3]
        tile_h -= 重叠纵向
        tile_w -= 重叠横向
        out_w = 列数 * tile_w
        out_h = 行数 * tile_h

        out = torch.zeros((1, out_h, out_w, 切片批次.shape[3]), device=切片批次.device, dtype=切片批次.dtype)

        for i in range(行数):
            for j in range(列数):
                y1 = i * tile_h
                x1 = j * tile_w

                if i > 0:
                    y1 -= 重叠纵向
                if j > 0:
                    x1 -= 重叠横向

                y2 = y1 + tile_h + 重叠纵向
                x2 = x1 + tile_w + 重叠横向

                if y2 > out_h:
                    y2 = out_h
                    y1 = y2 - tile_h - 重叠纵向
                if x2 > out_w:
                    x2 = out_w
                    x1 = x2 - tile_w - 重叠横向
                
                mask = torch.ones((1, tile_h + 重叠纵向, tile_w + 重叠横向), device=切片批次.device, dtype=切片批次.dtype)

                # 羽化顶部重叠区域
                if i > 0 and 重叠纵向 > 0:
                    mask[:, :重叠纵向, :] *= torch.linspace(0, 1, 重叠纵向, device=切片批次.device, dtype=切片批次.dtype).unsqueeze(1)
                # 羽化左侧重叠区域
                if j > 0 and 重叠横向 > 0:
                    mask[:, :, :重叠横向] *= torch.linspace(0, 1, 重叠横向, device=切片批次.device, dtype=切片批次.dtype).unsqueeze(0)
                
                mask = mask.unsqueeze(-1).repeat(1, 1, 1, 切片批次.shape[3])
                tile = 切片批次[i * 列数 + j] * mask
                out[:, y1:y2, x1:x2, :] = out[:, y1:y2, x1:x2, :] * (1 - mask) + tile
        return (out,)


# ==========================================
# 注册与显示名称
# ==========================================
NODE_CLASS_MAPPINGS = {
    "wcx_ImageTile": wcx_ImageTile,
    "wcx_ImageUntile": wcx_ImageUntile
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_ImageTile": "Image Tile",
    "wcx_ImageUntile": "Image Untile"
}