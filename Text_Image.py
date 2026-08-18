import os
import torch
import textwrap
from PIL import Image, ImageFont, ImageDraw


# ============================================================
# ComfyUI-Practical-Tools
# SimpleTextImage
#
# 独立版本：
# - 适配当前节点包根目录自动扫描加载方式
# - 支持 IMAGE / MASK 作为 size_as
# - 只扫描自带 fonts 文件夹，并缓存字体列表
# ============================================================


NODE_DIR = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = os.path.join(NODE_DIR, "fonts")


def tensor_to_pil(value):
    """将 ComfyUI IMAGE / MASK Tensor 转成 PIL Image，仅用于获取尺寸。"""
    if value is None:
        return None

    if not isinstance(value, torch.Tensor):
        raise TypeError(f"Unsupported size_as type: {type(value).__name__}")

    value = value.detach().cpu()

    # IMAGE: [B, H, W, C]
    # MASK : [B, H, W]
    if value.ndim == 4:
        image = value[0]

        if image.shape[-1] == 1:
            image = image[:, :, 0]
            array = (image.clamp(0, 1).numpy() * 255).astype("uint8")
            return Image.fromarray(array, mode="L")

        if image.shape[-1] == 3:
            array = (image.clamp(0, 1).numpy() * 255).astype("uint8")
            return Image.fromarray(array, mode="RGB")

        if image.shape[-1] == 4:
            array = (image.clamp(0, 1).numpy() * 255).astype("uint8")
            return Image.fromarray(array, mode="RGBA")

        raise ValueError(
            f"Unsupported IMAGE channel count: {image.shape[-1]}"
        )

    # MASK: [B, H, W]
    if value.ndim == 3:
        image = value[0]
        array = (image.clamp(0, 1).numpy() * 255).astype("uint8")
        return Image.fromarray(array, mode="L")

    # 单张 [H, W]
    if value.ndim == 2:
        array = (value.clamp(0, 1).numpy() * 255).astype("uint8")
        return Image.fromarray(array, mode="L")

    raise ValueError(
        f"Unsupported size_as tensor shape: {tuple(value.shape)}"
    )


def pil_to_tensor(image):
    """PIL -> ComfyUI IMAGE Tensor，格式 [B, H, W, C]，范围 0~1。"""
    if image.mode != "RGB":
        image = image.convert("RGB")

    data = torch.from_numpy(
        __import__("numpy").array(image).astype("float32") / 255.0
    )

    return data.unsqueeze(0)


def alpha_to_mask(alpha):
    """PIL Alpha -> ComfyUI MASK Tensor，格式 [B, H, W]。"""
    import numpy as np

    data = np.array(alpha).astype("float32") / 255.0
    return torch.from_numpy(data).unsqueeze(0)


_FONT_CACHE = None


def get_font_list():
    """只扫描节点包自身 fonts 文件夹，并缓存结果。"""
    global _FONT_CACHE

    if _FONT_CACHE is not None:
        return _FONT_CACHE

    fonts = {}

    if os.path.isdir(FONT_DIR):
        extensions = {".ttf", ".otf", ".ttc"}

        for root, _, files in os.walk(FONT_DIR):
            for filename in files:
                if os.path.splitext(filename)[1].lower() not in extensions:
                    continue

                path = os.path.join(root, filename)
                display_name = os.path.relpath(path, FONT_DIR)

                if display_name in fonts:
                    display_name = path

                fonts[display_name] = path

    _FONT_CACHE = dict(
        sorted(fonts.items(), key=lambda x: x[0].lower())
    )

    return _FONT_CACHE


def load_font(font_file, font_size):
    fonts = get_font_list()

    font_path = fonts.get(font_file)

    # 如果没有字体资源，尝试把输入直接当成路径
    if font_path is None and isinstance(font_file, str):
        if os.path.isfile(font_file):
            font_path = font_file

    if font_path is None:
        raise RuntimeError(
            "No valid font was found.\n"
            "Please put .ttf/.otf/.ttc files into:\n"
            f"{FONT_DIR}"
        )

    return ImageFont.truetype(
        font=font_path,
        size=int(font_size),
        encoding="unic",
    )


class TextImage:

    NODE_NAME = "TextImage"

    @classmethod
    def INPUT_TYPES(cls):
        fonts = get_font_list()

        font_list = list(fonts.keys())

        # 没有字体时仍然让节点可以被加载，
        # 实际执行时给出明确错误。
        if not font_list:
            font_list = ["<No fonts found>"]

        return {
            "required": {
                "text": (
                    "STRING",
                    {
                        "default": "text",
                        "multiline": True,
                    },
                ),
                "font_file": (
                    font_list,
                    {
                        "default": font_list[0],
                    },
                ),
                "align": (
                    ["center", "left", "right"],
                    {
                        "default": "center",
                    },
                ),
                "char_per_line": (
                    "INT",
                    {
                        "default": 80,
                        "min": 1,
                        "max": 8096,
                        "step": 1,
                    },
                ),
                "leading": (
                    "INT",
                    {
                        "default": 8,
                        "min": 0,
                        "max": 8096,
                        "step": 1,
                    },
                ),
                "font_size": (
                    "INT",
                    {
                        "default": 72,
                        "min": 1,
                        "max": 2500,
                        "step": 1,
                    },
                ),
                "text_color": (
                    "STRING",
                    {
                        "default": "#FFFFFF",
                    },
                ),
                "stroke_width": (
                    "INT",
                    {
                        "default": 0,
                        "min": 0,
                        "max": 8096,
                        "step": 1,
                    },
                ),
                "stroke_color": (
                    "STRING",
                    {
                        "default": "#FF8000",
                    },
                ),
                "x_offset": (
                    "INT",
                    {
                        "default": 0,
                        "min": 0,
                        "max": 8096,
                        "step": 1,
                    },
                ),
                "y_offset": (
                    "INT",
                    {
                        "default": 0,
                        "min": 0,
                        "max": 8096,
                        "step": 1,
                    },
                ),
                "width": (
                    "INT",
                    {
                        "default": 512,
                        "min": 1,
                        "max": 8096,
                        "step": 1,
                    },
                ),
                "height": (
                    "INT",
                    {
                        "default": 512,
                        "min": 1,
                        "max": 8096,
                        "step": 1,
                    },
                ),
            },
            "optional": {
                "size_as": ("*", {}),
            },
        }

    RETURN_TYPES = ("IMAGE", "MASK")
    RETURN_NAMES = ("image", "mask")
    FUNCTION = "simple_text_image"
    CATEGORY = "Practical-Tools/Image"

    def simple_text_image(
        self,
        text,
        font_file,
        align,
        char_per_line,
        leading,
        font_size,
        text_color,
        stroke_width,
        stroke_color,
        x_offset,
        y_offset,
        width,
        height,
        size_as=None,
    ):

        # ----------------------------------------------------
        # 根据 size_as 自动获取输出尺寸
        # ----------------------------------------------------
        if size_as is not None:
            if not isinstance(size_as, torch.Tensor):
                raise TypeError(
                    f"size_as must be a Tensor, got {type(size_as).__name__}"
                )

            size_image = tensor_to_pil(size_as)

            if size_image is not None:
                width, height = size_image.size

        width = int(width)
        height = int(height)

        if width <= 0 or height <= 0:
            raise ValueError(
                f"Invalid image size: {width}x{height}"
            )

        # ----------------------------------------------------
        # 字体
        # ----------------------------------------------------
        if font_file == "<No fonts found>":
            raise RuntimeError(
                "No fonts found. Put .ttf/.otf/.ttc files into:\n"
                f"{FONT_DIR}"
            )

        font = load_font(font_file, font_size)

        # ----------------------------------------------------
        # 创建透明 RGBA 画布
        # ----------------------------------------------------
        img = Image.new(
            "RGBA",
            size=(width, height),
            color=(0, 0, 0, 0),
        )

        draw = ImageDraw.Draw(img)

        y_text = int(y_offset + stroke_width)

        # 保留原节点的换行逻辑
        paragraphs = str(text).split("\n")

        for paragraph in paragraphs:

            lines = textwrap.wrap(
                paragraph,
                width=int(char_per_line),
                expand_tabs=False,
                replace_whitespace=False,
                drop_whitespace=False,
            )

            # 空行也要保留
            if not lines:
                lines = [""]

            for line in lines:

                bbox = font.getbbox(
                    line,
                    stroke_width=int(stroke_width),
                )

                text_width = bbox[2] - bbox[0]
                text_height = bbox[3] - bbox[1]

                # ------------------------------------------------
                # 根据 align 计算 X
                # ------------------------------------------------
                if align == "left":
                    x_text = int(x_offset)

                elif align == "center":
                    x_text = int((width - text_width) // 2)

                elif align == "right":
                    x_text = int(width - text_width - x_offset)

                else:
                    x_text = int(x_offset)

                draw.text(
                    xy=(x_text, y_text),
                    text=line,
                    fill=text_color,
                    font=font,
                    stroke_width=int(stroke_width),
                    stroke_fill=stroke_color,
                )

                y_text += text_height + int(leading)

            # 段落之间额外留一点间距
            y_text += int(leading) * 2

        # ----------------------------------------------------
        # 输出 IMAGE / MASK
        # ----------------------------------------------------
        image_tensor = pil_to_tensor(img)

        # Alpha 通道作为 MASK
        mask_tensor = alpha_to_mask(img.getchannel("A"))

        # 如果 size_as 是 batch，则复制到相同 batch 数量
        if size_as is not None and isinstance(size_as, torch.Tensor):
            if size_as.ndim >= 3:
                batch_size = int(size_as.shape[0])

                if batch_size > 1:
                    image_tensor = image_tensor.repeat(
                        batch_size, 1, 1, 1
                    )
                    mask_tensor = mask_tensor.repeat(
                        batch_size, 1, 1
                    )

        return (
            image_tensor,
            mask_tensor,
        )


NODE_CLASS_MAPPINGS = {
    "wcx_TextImage": TextImage,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_TextImage": "Text Image",
}
