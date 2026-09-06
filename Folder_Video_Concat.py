import os
import re
import shutil
import subprocess
import uuid


class FolderVideoConcat:
    NAME = "Folder Video Concat"
    CATEGORY = "Practical-Tools/video"

    VIDEO_EXTENSIONS = {
        ".mp4",
        ".mov",
        ".mkv",
        ".avi",
        ".webm",
        ".m4v",
        ".ts",
        ".mts",
        ".m2ts",
        ".flv",
        ".wmv",
    }

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

    RETURN_TYPES = ("VIDEO",)
    RETURN_NAMES = ("video",)
    FUNCTION = "concat_videos"

    # =========================================================
    # 获取 ComfyUI 根目录
    # =========================================================

    @staticmethod
    def get_comfyui_root():

        # ComfyUI 官方 folder_paths
        try:
            import folder_paths

            output_dir = os.path.abspath(
                folder_paths.get_output_directory()
            )

            # 默认 output 就在 ComfyUI 根目录
            return os.path.dirname(output_dir)

        except Exception:
            pass

        # 备用方案
        # 当前文件：
        #
        # ComfyUI/
        # └── custom_nodes/
        #     └── Practical-Tools/
        #         └── Folder_Video_Concat.py
        #
        current_dir = os.path.dirname(
            os.path.abspath(__file__)
        )

        # Practical-Tools
        plugin_dir = current_dir

        # custom_nodes
        custom_nodes_dir = os.path.dirname(
            plugin_dir
        )

        # ComfyUI
        comfyui_root = os.path.dirname(
            custom_nodes_dir
        )

        return comfyui_root

    # =========================================================
    # 解析输入路径
    #
    # 绝对路径：
    #     F:\Videos
    #
    # 相对路径：
    #     output/folder
    #
    # 自动解析为：
    #     ComfyUI/output/folder
    # =========================================================

    @classmethod
    def resolve_folder_path(cls, folder_path):

        folder_path = folder_path.strip()

        # 去除首尾引号
        if (
            len(folder_path) >= 2
            and folder_path[0] == '"'
            and folder_path[-1] == '"'
        ):
            folder_path = folder_path[1:-1]

        if (
            len(folder_path) >= 2
            and folder_path[0] == "'"
            and folder_path[-1] == "'"
        ):
            folder_path = folder_path[1:-1]

        # 环境变量
        folder_path = os.path.expandvars(
            folder_path
        )

        # 用户目录 ~
        folder_path = os.path.expanduser(
            folder_path
        )

        # -----------------------------------------------------
        # 绝对路径
        # -----------------------------------------------------

        if os.path.isabs(folder_path):

            return os.path.abspath(
                folder_path
            )

        # -----------------------------------------------------
        # 相对路径
        #
        # 一律相对于 ComfyUI 根目录
        # 而不是 Python 当前工作目录
        # -----------------------------------------------------

        comfyui_root = cls.get_comfyui_root()

        return os.path.abspath(
            os.path.join(
                comfyui_root,
                folder_path,
            )
        )

    # =========================================================
    # 查找 FFmpeg
    # =========================================================

    @staticmethod
    def find_ffmpeg():

        ffmpeg_name = (
            "ffmpeg.exe"
            if os.name == "nt"
            else "ffmpeg"
        )

        # 1. PATH
        ffmpeg = shutil.which(
            ffmpeg_name
        )

        if ffmpeg:
            return ffmpeg

        # 2. 插件目录及 ComfyUI 附近
        current_dir = os.path.dirname(
            os.path.abspath(__file__)
        )

        search_dirs = []

        root = current_dir

        for _ in range(8):

            search_dirs.append(root)

            parent = os.path.dirname(root)

            if parent == root:
                break

            root = parent

        for directory in search_dirs:

            candidates = [
                os.path.join(
                    directory,
                    ffmpeg_name,
                ),
                os.path.join(
                    directory,
                    "bin",
                    ffmpeg_name,
                ),
            ]

            for path in candidates:

                if os.path.isfile(path):
                    return path

        return None

    # =========================================================
    # 自然排序
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
    # 获取视频文件
    # =========================================================

    def get_video_files(self, folder_path):

        video_files = []

        try:
            entries = os.listdir(
                folder_path
            )

        except Exception as e:

            raise RuntimeError(
                f"无法读取文件夹：\n"
                f"{folder_path}\n\n"
                f"{e}"
            )

        for filename in entries:

            full_path = os.path.join(
                folder_path,
                filename,
            )

            # 忽略子文件夹
            if not os.path.isfile(full_path):
                continue

            extension = os.path.splitext(
                filename
            )[1].lower()

            if extension in self.VIDEO_EXTENSIONS:

                video_files.append(
                    full_path
                )

        video_files.sort(
            key=self.natural_sort_key
        )

        return video_files

    # =========================================================
    # 创建 FFmpeg concat 文件
    # =========================================================

    @staticmethod
    def create_concat_file(
        video_files,
        concat_file,
    ):

        with open(
            concat_file,
            "w",
            encoding="utf-8",
            newline="\n",
        ) as f:

            for video in video_files:

                path = os.path.abspath(
                    video
                )

                # FFmpeg concat 使用 /
                path = path.replace(
                    "\\",
                    "/",
                )

                # 转义单引号
                path = path.replace(
                    "'",
                    "'\\''",
                )

                f.write(
                    f"file '{path}'\n"
                )

    # =========================================================
    # 主函数
    # =========================================================

    def concat_videos(self, folder_path):

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

            raise RuntimeError(
                f"文件夹不存在：\n"
                f"{folder_path}"
            )

        # -----------------------------------------------------
        # 3. 查找视频
        # -----------------------------------------------------

        video_files = self.get_video_files(
            folder_path
        )

        if not video_files:

            raise RuntimeError(
                f"文件夹中没有找到视频文件：\n"
                f"{folder_path}"
            )

        # -----------------------------------------------------
        # 4. 查找 FFmpeg
        # -----------------------------------------------------

        ffmpeg = self.find_ffmpeg()

        if ffmpeg is None:

            raise RuntimeError(
                "未找到 FFmpeg。\n\n"
                "请确保 ffmpeg.exe 已加入系统 PATH。"
            )

        # -----------------------------------------------------
        # 5. ComfyUI output
        #
        # 最终视频放到：
        #
        # ComfyUI/output/folder_video_concat/
        #
        # 不放 Temp。
        # -----------------------------------------------------

        try:

            import folder_paths

            output_root = (
                folder_paths.get_output_directory()
            )

        except Exception:

            output_root = os.path.join(
                self.get_comfyui_root(),
                "output",
            )

        output_dir = os.path.join(
            output_root,
            "folder_video_concat",
        )

        os.makedirs(
            output_dir,
            exist_ok=True,
        )

        # -----------------------------------------------------
        # 6. 唯一 ID
        # -----------------------------------------------------

        unique_id = uuid.uuid4().hex

        work_dir = os.path.join(
            output_dir,
            f".working_{unique_id}",
        )

        os.makedirs(
            work_dir,
            exist_ok=True,
        )

        concat_file = os.path.join(
            work_dir,
            "concat.txt",
        )

        output_file = os.path.join(
            output_dir,
            f"merged_{unique_id}.mp4",
        )

        try:

            # -------------------------------------------------
            # 7. 创建 concat 列表
            # -------------------------------------------------

            self.create_concat_file(
                video_files,
                concat_file,
            )

            # -------------------------------------------------
            # 8. FFmpeg 无损合并
            # -------------------------------------------------

            command = [
                ffmpeg,

                "-hide_banner",

                "-loglevel",
                "error",

                "-y",

                "-f",
                "concat",

                "-safe",
                "0",

                "-i",
                concat_file,

                "-c",
                "copy",

                "-movflags",
                "+faststart",

                output_file,
            ]

            result = subprocess.run(
                command,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace",
            )

            # -------------------------------------------------
            # 9. FFmpeg 错误
            # -------------------------------------------------

            if result.returncode != 0:

                error = result.stderr.strip()

                if not error:

                    error = (
                        "FFmpeg 返回错误代码："
                        f"{result.returncode}"
                    )

                try:

                    if os.path.isfile(
                        output_file
                    ):
                        os.remove(
                            output_file
                        )

                except Exception:
                    pass

                raise RuntimeError(
                    "视频合并失败：\n\n"
                    + error
                )

            # -------------------------------------------------
            # 10. 检查输出
            # -------------------------------------------------

            if not os.path.isfile(
                output_file
            ):

                raise RuntimeError(
                    "FFmpeg 执行完成，但是没有生成输出视频。"
                )

            if os.path.getsize(
                output_file
            ) <= 0:

                raise RuntimeError(
                    "生成的视频文件为空。"
                )

            # -------------------------------------------------
            # 11. ComfyUI VIDEO
            # -------------------------------------------------

            try:

                from comfy_api.latest import InputImpl

                video = InputImpl.VideoFromFile(
                    output_file
                )

            except ImportError:

                try:

                    from comfy_api.input_impl import (
                        VideoFromFile
                    )

                    video = VideoFromFile(
                        output_file
                    )

                except ImportError as e:

                    try:

                        os.remove(
                            output_file
                        )

                    except Exception:
                        pass

                    raise RuntimeError(
                        "当前 ComfyUI 版本不支持原生 VIDEO 类型。"
                    ) from e

            # -------------------------------------------------
            # 12. 返回 VIDEO
            #
            # output_file 必须保留。
            #
            # ComfyUI 后续节点会读取这个文件。
            # -------------------------------------------------

            return (video,)

        finally:

            # -------------------------------------------------
            # 13. 只删除 concat 工作目录
            #
            # 不删除最终 MP4。
            # -------------------------------------------------

            try:

                if os.path.isdir(
                    work_dir
                ):

                    shutil.rmtree(
                        work_dir,
                        ignore_errors=True,
                    )

            except Exception:
                pass


# =============================================================
# ComfyUI 注册
# =============================================================

NODE_CLASS_MAPPINGS = {
    "wcx_FolderVideoConcat": FolderVideoConcat,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_FolderVideoConcat": "Folder Video Concat",
}