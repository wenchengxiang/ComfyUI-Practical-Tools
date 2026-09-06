import os
import re

import torch
import numpy as np
import comfy
from PIL import Image, ImageOps


class wcx_FolderImageLoad:
    """
    从指定文件夹加载全部图片。

    处理方式严格参考 Load_Image_Batch_From_Dir.py：
    - 文件名自然排序
    - 图片统一转换为 RGB
    - 以第一张图片的尺寸作为 Batch 目标尺寸
    - 后续不同尺寸图片使用 comfy.utils.common_upscale()
      进行 bilinear + center 缩放
    - 最终输出 ComfyUI IMAGE Batch
    - 不使用 Padding
    """

    NAME = "Folder Image Load"
    CATEGORY = "Practical-Tools/Image"

    # =========================================================
    # 支持的图片格式
    # =========================================================

    VALID_EXTENSIONS = {
        ".jpg",
        ".jpeg",
        ".png",
        ".webp",
        ".bmp",
        ".gif",
        ".tif",
        ".tiff",
        ".avif",
    }

    # =========================================================
    # ComfyUI 输入
    # =========================================================

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "folder_path": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": False,
                        "placeholder": "绝对路径或相对于 ComfyUI 的路径，例如 output/folder",
                    },
                ),
            }
        }

    # =========================================================
    # 输出
    # =========================================================

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("images",)
    FUNCTION = "load_images"

    # =========================================================
    # 获取 ComfyUI 根目录
    # =========================================================

    @staticmethod
    def get_comfyui_root():

        try:
            import folder_paths

            output_dir = os.path.abspath(
                folder_paths.get_output_directory()
            )

            return os.path.dirname(output_dir)

        except Exception:
            pass

        # 备用：
        #
        # ComfyUI/
        # └── custom_nodes/
        #     └── Practical-Tools/
        #         └── Folder_Image_Load.py

        current_dir = os.path.dirname(
            os.path.abspath(__file__)
        )

        custom_nodes_dir = os.path.dirname(
            current_dir
        )

        return os.path.dirname(
            custom_nodes_dir
        )

    # =========================================================
    # 解析路径
    #
    # 支持：
    #
    # F:/Images
    # F:\Images
    #
    # output/images
    # output\images
    #
    # ./output/images
    # =========================================================

    @classmethod
    def resolve_folder_path(cls, folder_path):

        folder_path = folder_path.strip()

        # 去掉首尾引号
        if len(folder_path) >= 2:

            if (
                folder_path[0] == '"'
                and folder_path[-1] == '"'
            ):
                folder_path = folder_path[1:-1]

            elif (
                folder_path[0] == "'"
                and folder_path[-1] == "'"
            ):
                folder_path = folder_path[1:-1]

        # 环境变量
        folder_path = os.path.expandvars(
            folder_path
        )

        # 用户目录
        folder_path = os.path.expanduser(
            folder_path
        )

        # Windows 同时支持 / 和 \
        if os.name == "nt":

            folder_path = folder_path.replace(
                "/",
                os.sep,
            )

        # 绝对路径
        if os.path.isabs(folder_path):

            return os.path.abspath(
                folder_path
            )

        # 相对路径：
        # 相对于 ComfyUI 根目录

        comfyui_root = cls.get_comfyui_root()

        return os.path.abspath(
            os.path.join(
                comfyui_root,
                folder_path,
            )
        )

    # =========================================================
    # 自然排序
    #
    # 例如：
    #
    # 1.png
    # 2.png
    # 10.png
    #
    # 而不是：
    #
    # 1.png
    # 10.png
    # 2.png
    # =========================================================

    @staticmethod
    def natural_sort_key(path):

        filename = os.path.basename(path)

        return [
            int(text)
            if text.isdigit()
            else text.lower()
            for text in re.split(
                r"(\d+)",
                filename,
            )
        ]

    # =========================================================
    # 获取文件夹内图片
    # =========================================================

    @classmethod
    def get_image_files(cls, folder_path):

        try:

            dir_files = os.listdir(
                folder_path
            )

        except Exception as e:

            raise FileNotFoundError(
                f"无法读取文件夹：\n"
                f"{folder_path}\n\n"
                f"{e}"
            )

        if len(dir_files) == 0:

            raise FileNotFoundError(
                f"文件夹为空：\n"
                f"{folder_path}"
            )

        # 只保留支持的图片格式
        dir_files = [
            filename
            for filename in dir_files
            if os.path.isfile(
                os.path.join(
                    folder_path,
                    filename,
                )
            )
            and os.path.splitext(
                filename
            )[1].lower()
            in cls.VALID_EXTENSIONS
        ]

        # 自然排序
        dir_files.sort(
            key=cls.natural_sort_key
        )

        return [
            os.path.join(
                folder_path,
                filename,
            )
            for filename in dir_files
        ]

    # =========================================================
    # 加载图片
    #
    # 参考原节点：
    #
    # i = Image.open(image_path)
    # i = ImageOps.exif_transpose(i)
    # image = i.convert("RGB")
    # =========================================================

    @staticmethod
    def load_image(image_path):

        try:

            i = Image.open(
                image_path
            )

            # 修正 EXIF 方向
            i = ImageOps.exif_transpose(
                i
            )

            # 统一 RGB
            image = i.convert(
                "RGB"
            )

            # 转 numpy
            image = np.array(
                image
            ).astype(
                np.float32
            ) / 255.0

            # 转 ComfyUI IMAGE
            #
            # [H,W,C]
            # →
            # [1,H,W,C]

            image = torch.from_numpy(
                image
            )[None,]

            return image

        except Exception as e:

            raise RuntimeError(
                f"无法加载图片：\n"
                f"{image_path}\n\n"
                f"{e}"
            )

    # =========================================================
    # 主函数
    # =========================================================

    def load_images(self, folder_path):

        # -----------------------------------------------------
        # 1. 解析路径
        # -----------------------------------------------------

        folder_path = self.resolve_folder_path(
            folder_path
        )

        # -----------------------------------------------------
        # 2. 检查文件夹
        # -----------------------------------------------------

        if not os.path.isdir(
            folder_path
        ):

            raise FileNotFoundError(
                f"文件夹不存在：\n"
                f"{folder_path}"
            )

        # -----------------------------------------------------
        # 3. 获取并排序图片
        # -----------------------------------------------------

        image_files = self.get_image_files(
            folder_path
        )

        if len(image_files) == 0:

            raise FileNotFoundError(
                f"文件夹中没有找到支持的图片：\n"
                f"{folder_path}"
            )

        # -----------------------------------------------------
        # 4. 加载全部图片
        # -----------------------------------------------------

        images = []

        for image_path in image_files:

            try:

                image = self.load_image(
                    image_path
                )

                images.append(
                    image
                )

            except Exception as e:

                print(
                    f"[Warning] "
                    f"wcx_FolderImageLoad: "
                    f"跳过图片 {image_path}: {e}"
                )

                continue

        # -----------------------------------------------------
        # 5. 确认至少加载成功一张
        # -----------------------------------------------------

        if len(images) == 0:

            raise FileNotFoundError(
                f"没有成功加载任何图片：\n"
                f"{folder_path}"
            )

        # -----------------------------------------------------
        # 6. 第一张图片作为目标尺寸
        #
        # 严格参考：
        #
        # image1 = images[0]
        # -----------------------------------------------------

        image1 = images[0]

        target_height = image1.shape[1]
        target_width = image1.shape[2]

        # -----------------------------------------------------
        # 7. 后续图片统一尺寸
        #
        # 严格参考原节点：
        #
        # comfy.utils.common_upscale(
        #     image2.movedim(-1, 1),
        #     image1.shape[2],
        #     image1.shape[1],
        #     "bilinear",
        #     "center"
        # ).movedim(1, -1)
        #
        # 注意：
        # 这里的 "center" 是 common_upscale 的
        # crop / upscale 行为参数。
        # -----------------------------------------------------

        for image2 in images[1:]:

            if image1.shape[1:] != image2.shape[1:]:

                image2 = comfy.utils.common_upscale(
                    image2.movedim(
                        -1,
                        1,
                    ),
                    target_width,
                    target_height,
                    "bilinear",
                    "center",
                ).movedim(
                    1,
                    -1,
                )

            image1 = torch.cat(
                (
                    image1,
                    image2,
                ),
                dim=0,
            )

        # -----------------------------------------------------
        # 8. 返回 IMAGE Batch
        # -----------------------------------------------------

        return (
            image1,
        )


# =============================================================
# ComfyUI 注册
# =============================================================

NODE_CLASS_MAPPINGS = {
    "wcx_FolderImageLoad": wcx_FolderImageLoad,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_FolderImageLoad": "Folder Image Load",
}
