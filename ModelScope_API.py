import base64
import re
from io import BytesIO

import numpy as np
import torch
from PIL import Image

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None


class wcx_ModelScopeAPI:

    CATEGORY = "Practical-Tools/Utils"
    FUNCTION = "generate_text"

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("output",)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "api_tokens": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": True,
                        "placeholder": (
                            "输入 ModelScope API Token，"
                            "多个 Token 可用逗号、分号或换行分隔"
                        ),
                    },
                ),
            },

            "optional": {
                "image": (
                    "IMAGE",
                    {
                        "optional": True,
                    },
                ),

                "prompt": (
                    "STRING",
                    {
                        "multiline": True,
                        "default": "",
                    },
                ),

                "model": (
                    "STRING",
                    {
                        "default": "Qwen/Qwen3-VL-8B-Instruct",
                        "multiline": False,
                    },
                ),

                "max_tokens": (
                    "INT",
                    {
                        "default": 1000,
                        "min": 100,
                        "max": 4000,
                        "step": 1,
                    },
                ),

                "temperature": (
                    "FLOAT",
                    {
                        "default": 0.7,
                        "min": 0.1,
                        "max": 2.0,
                        "step": 0.1,
                    },
                ),

                "seed": (
                    "INT",
                    {
                        "default": -1,
                        "min": -1,
                        "max": 2147483647,
                        "step": 1,
                    },
                ),
            },
        }

    def tensor_to_base64_url(self, image_tensor):
        if len(image_tensor.shape) == 4:
            image_tensor = image_tensor[0]

        image_tensor = (
            image_tensor
            .detach()
            .cpu()
        )

        image_np = (
            image_tensor.numpy() * 255
        ).clip(
            0,
            255,
        ).astype(
            np.uint8
        )

        if image_np.shape[-1] == 4:
            pil_image = Image.fromarray(
                image_np,
                "RGBA",
            ).convert(
                "RGB"
            )
        else:
            pil_image = Image.fromarray(
                image_np,
                "RGB",
            )

        buffer = BytesIO()

        pil_image.save(
            buffer,
            format="JPEG",
            quality=85,
        )

        encoded = base64.b64encode(
            buffer.getvalue()
        ).decode(
            "utf-8"
        )

        return (
            "data:image/jpeg;base64,"
            + encoded
        )

    def create_blank_image(
        self,
        width=64,
        height=64,
    ):
        return torch.ones(
            (
                1,
                height,
                width,
                3,
            ),
            dtype=torch.float32,
        )

    def parse_api_tokens(
        self,
        api_tokens,
    ):
        if not api_tokens:
            return []

        tokens = re.split(
            r"[,;\n]+",
            api_tokens,
        )

        return [
            token.strip()
            for token in tokens
            if token.strip()
        ]

    def generate_text(
        self,
        api_tokens,
        image=None,
        prompt="",
        model="Qwen/Qwen3-VL-8B-Instruct",
        max_tokens=1000,
        temperature=0.7,
        seed=-1,
    ):

        if OpenAI is None:
            raise RuntimeError(
                "未安装 openai 库，请执行：\n"
                "pip install openai"
            )

        tokens = self.parse_api_tokens(
            api_tokens
        )

        if not tokens:
            raise RuntimeError(
                "请输入至少一个有效的 "
                "ModelScope API Token"
            )

        if seed != -1:
            np.random.seed(
                seed % (2**32 - 1)
            )

        if image is None:
            image = self.create_blank_image()

        # 保留用户输入的 Prompt。
        # 如果为空，就保持真正的空字符串。
        prompt = prompt.strip()

        try:
            image_url = (
                self.tensor_to_base64_url(
                    image
                )
            )
        except Exception as e:
            raise RuntimeError(
                f"图像转换失败: {e}"
            )

        messages = [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": prompt,
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": image_url,
                        },
                    },
                ],
            }
        ]

        last_error = None

        for token in tokens:

            try:
                client = OpenAI(
                    base_url=(
                        "https://api-inference.modelscope.cn/v1"
                    ),
                    api_key=token,
                )

                response = (
                    client.chat.completions.create(
                        model=model,
                        messages=messages,
                        max_tokens=max_tokens,
                        temperature=temperature,
                        stream=False,
                    )
                )

                if not response.choices:
                    raise RuntimeError(
                        "API 返回为空"
                    )

                result = (
                    response
                    .choices[0]
                    .message
                    .content
                )

                if result is None:
                    result = ""

                return (result,)

            except Exception as e:
                last_error = e

        raise RuntimeError(
            "所有 ModelScope API Token "
            f"均调用失败。\n"
            f"最后一次错误: {last_error}"
        )


NODE_CLASS_MAPPINGS = {
    "wcx_ModelScopeAPI": wcx_ModelScopeAPI,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_ModelScopeAPI": "ModelScope API",
}