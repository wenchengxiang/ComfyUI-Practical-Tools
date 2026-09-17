import math
import torch
import torch.nn.functional as F


class AnyType(str):
    """允许 IMAGE / MASK 等任意 ComfyUI 类型连接。"""

    def __ne__(self, value):
        return False

    def __eq__(self, value):
        return True

    def __str__(self):
        return "*"


ANY = AnyType("*")


class ImageGridTable:

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "输入": (ANY,),

                "排列方式": (
                    ["最大行数", "最大列数"],
                    {
                        "default": "最大行数"
                    }
                ),

                "最大行数_列数": (
                    "INT",
                    {
                        "default": 2,
                        "min": 1,
                        "max": 100,
                        "step": 1
                    }
                ),

                "输出尺寸": (
                    ["实际大小", "指定宽度"],
                    {
                        "default": "实际大小"
                    }
                ),

                "指定宽度": (
                    "INT",
                    {
                        "default": 2048,
                        "min": 64,
                        "max": 16384,
                        "step": 1
                    }
                ),

                "间距": (
                    "INT",
                    {
                        "default": 0,
                        "min": 0,
                        "max": 1000,
                        "step": 1
                    }
                ),

                "四周边距": (
                    "INT",
                    {
                        "default": 0,
                        "min": 0,
                        "max": 1000,
                        "step": 1
                    }
                ),

                "背景值": (
                    "FLOAT",
                    {
                        "default": 0.0,
                        "min": 0.0,
                        "max": 1.0,
                        "step": 0.01
                    }
                ),
            }
        }

    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("输出",)

    FUNCTION = "ImageGridTable"
    CATEGORY = "Practical-Tools/image"

    @classmethod
    def VALIDATE_INPUTS(cls, input_types):
        return True

    def ImageGridTable(
        self,
        输入,
        排列方式,
        最大行数_列数,
        输出尺寸,
        指定宽度,
        间距,
        四周边距,
        背景值,
    ):

        # ==========================================================
        # 判断 IMAGE / MASK
        #
        # IMAGE = [B,H,W,C]
        # MASK  = [B,H,W]
        # ==========================================================

        if 输入 is None:
            raise ValueError("输入不能为空")

        if not isinstance(输入, torch.Tensor):
            raise ValueError(
                f"输入必须是 Tensor，当前类型：{type(输入).__name__}"
            )

        if 输入.ndim == 4:

            input_type = "IMAGE"

            batch_size, height, width, channels = 输入.shape

            # [B,H,W,C] -> [B,C,H,W]
            work = 输入.permute(0, 3, 1, 2)

        elif 输入.ndim == 3:

            input_type = "MASK"

            batch_size, height, width = 输入.shape

            channels = 1

            # [B,H,W] -> [B,1,H,W]
            work = 输入.unsqueeze(1)

        else:

            raise ValueError(
                "输入必须是 IMAGE 或 MASK。\n"
                f"当前 shape：{tuple(输入.shape)}"
            )

        if batch_size == 0:
            raise ValueError("输入 Batch 不能为空")

        # ==========================================================
        # 计算行列
        # ==========================================================

        if 排列方式 == "最大行数":

            rows = min(
                最大行数_列数,
                batch_size
            )

            cols = math.ceil(
                batch_size / rows
            )

        else:

            cols = min(
                最大行数_列数,
                batch_size
            )

            rows = math.ceil(
                batch_size / cols
            )

        # ==========================================================
        # 模式一
        #
        # 原图联结实际大小
        # ==========================================================

        if 输出尺寸 == "实际大小":

            cell_widths = [width] * cols
            cell_height = height
            gap = 间距

            output_width = (
                四周边距 * 2
                + sum(cell_widths)
                + (cols - 1) * gap
            )

            output_height = (
                四周边距 * 2
                + rows * cell_height
                + (rows - 1) * gap
            )

            result = torch.full(
                (
                    1,
                    channels,
                    output_height,
                    output_width
                ),
                背景值,
                dtype=输入.dtype,
                device=输入.device
            )

            # 放置图片
            x = 四周边距

            for i in range(batch_size):

                col = i % cols
                row = i // cols

                y = (
                    四周边距
                    + row * (cell_height + gap)
                )

                result[
                    0,
                    :,
                    y:y + cell_height,
                    x:x + cell_widths[col]
                ] = work[i]

                x += cell_widths[col] + gap

                if col == cols - 1:
                    x = 四周边距

        # ==========================================================
        # 模式二
        #
        # 指定最终输出宽度
        #
        # 这里严格保证：
        #
        # output_width == 指定宽度
        #
        # 不会在右侧留下多余像素。
        # ==========================================================

        else:

            padding_width = 四周边距 * 2

            if 指定宽度 <= padding_width:

                raise ValueError(
                    f"指定宽度 {指定宽度} 必须大于"
                    f"四周边距总宽度 {padding_width}"
                )

            # ------------------------------------------------------
            # 去除左右边距后，可用于图片+间距的宽度
            # ------------------------------------------------------

            content_width = (
                指定宽度
                - padding_width
            )

            # ------------------------------------------------------
            # 原始内容宽度
            # ------------------------------------------------------

            original_content_width = (
                cols * width
                + (cols - 1) * 间距
            )

            # ------------------------------------------------------
            # 整体缩放比例
            #
            # 所有图片使用同一个比例。
            # ------------------------------------------------------

            scale = (
                content_width
                / original_content_width
            )

            # ------------------------------------------------------
            # 间距缩放
            # ------------------------------------------------------

            scaled_gap = max(
                0,
                round(间距 * scale)
            )

            # ------------------------------------------------------
            # 根据最终宽度计算所有列的宽度。
            #
            # 这里不再简单 round(width * scale)
            #
            # 而是把整数像素误差分配到各列。
            #
            # 例如：
            #
            # 目标图片区域 = 2048
            # 3列
            #
            # 得到：
            #
            # 683 + 683 + 682
            #
            # 而不是：
            #
            # 683 + 683 + 683 + 余量
            # ------------------------------------------------------

            available_for_images = (
                content_width
                - (cols - 1) * scaled_gap
            )

            if available_for_images < cols:

                raise ValueError(
                    "指定宽度过小，无法容纳当前列数和间距"
                )

            # 理论上的单列宽度
            ideal_cell_width = (
                width * scale
            )

            # 基础整数宽度
            base_width = int(
                math.floor(ideal_cell_width)
            )

            base_width = max(
                1,
                base_width
            )

            # ------------------------------------------------------
            # 最终所有图片宽度必须加起来正好等于
            # available_for_images。
            #
            # 像素误差分配到各列。
            # ------------------------------------------------------

            total_image_width = (
                base_width * cols
            )

            remaining = (
                available_for_images
                - total_image_width
            )

            if remaining < 0:

                # 极端情况下重新计算
                base_width = max(
                    1,
                    available_for_images // cols
                )

                remaining = (
                    available_for_images
                    - base_width * cols
                )

            # ------------------------------------------------------
            # 创建每一列的实际整数宽度
            #
            # 尽量均匀地分配剩余像素。
            # ------------------------------------------------------

            cell_widths = [
                base_width
                for _ in range(cols)
            ]

            for i in range(remaining):

                cell_widths[
                    i % cols
                ] += 1

            # ------------------------------------------------------
            # 高度统一按照同一个缩放比例计算。
            # ------------------------------------------------------

            cell_height = max(
                1,
                round(height * scale)
            )

            # ------------------------------------------------------
            # 最终高度
            # ------------------------------------------------------

            output_height = (
                四周边距 * 2
                + rows * cell_height
                + (rows - 1) * scaled_gap
            )

            # ------------------------------------------------------
            # 最终宽度直接等于指定宽度
            # ------------------------------------------------------

            output_width = 指定宽度

            result = torch.full(
                (
                    1,
                    channels,
                    output_height,
                    output_width
                ),
                背景值,
                dtype=输入.dtype,
                device=输入.device
            )

            # ------------------------------------------------------
            # 每张图片分别缩放到对应列宽度
            #
            # 注意：
            # 由于像素只能是整数，
            # 各列可能相差 1px。
            #
            # 但它们来自完全相同的缩放比例，
            # 只是整数像素取整误差被分摊了。
            # ------------------------------------------------------

            x = 四周边距

            for i in range(batch_size):

                col = i % cols
                row = i // cols

                current_width = cell_widths[col]

                current_height = cell_height

                image = work[i:i + 1]

                resized = F.interpolate(
                    image,
                    size=(
                        current_height,
                        current_width
                    ),
                    mode="bilinear",
                    align_corners=False
                )

                y = (
                    四周边距
                    + row * (
                        cell_height
                        + scaled_gap
                    )
                )

                result[
                    0,
                    :,
                    y:y + current_height,
                    x:x + current_width
                ] = resized[0]

                x += (
                    current_width
                    + scaled_gap
                )

                if col == cols - 1:
                    x = 四周边距

        # ==========================================================
        # 恢复 ComfyUI IMAGE / MASK 格式
        # ==========================================================

        if input_type == "IMAGE":

            # [B,C,H,W] -> [B,H,W,C]

            result = result.permute(
                0,
                2,
                3,
                1
            )

        else:

            # [B,1,H,W] -> [B,H,W]

            result = result[:, 0, :, :]

        # ==========================================================
        # 严格检查最终宽度
        # ==========================================================

        if result.shape[2] != output_width:

            raise RuntimeError(
                f"制表图宽度错误："
                f"实际 {result.shape[2]}，"
                f"预期 {output_width}"
            )

        return (result,)


# ==============================================================
# ComfyUI 节点注册
# ==============================================================

NODE_CLASS_MAPPINGS = {
    "wcx_ImageGridTable": ImageGridTable
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_ImageGridTable": "Image Grid Table"
}