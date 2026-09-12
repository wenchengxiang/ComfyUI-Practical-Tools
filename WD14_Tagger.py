import os
import csv
import hashlib

import numpy as np
import onnxruntime as ort
from PIL import Image

import folder_paths
import comfy.utils


# ============ 基础设置 ============

MODELS_DIR = os.path.join(
    folder_paths.models_dir,
    "wd14"
)

DEFAULT_MODEL = "wd-v1-4-moat-tagger-v2"
DEFAULT_THRESHOLD = 0.35
DEFAULT_CHARACTER_THRESHOLD = 0.85


# ============ 缓存 ============

_MODEL_CACHE = {}
_TAG_CACHE = {}
_RESULT_CACHE = {}


# ============ ONNX Runtime ============

_AVAILABLE_PROVIDERS = ort.get_available_providers()

if "CUDAExecutionProvider" in _AVAILABLE_PROVIDERS:
    ORT_PROVIDERS = [
        "CUDAExecutionProvider",
        "CPUExecutionProvider",
    ]
else:
    ORT_PROVIDERS = [
        "CPUExecutionProvider",
    ]


# ============ 模型文件 ============

def get_model_path(model_name):
    return os.path.join(
        MODELS_DIR,
        f"{model_name}.onnx"
    )


def get_tag_path(model_name):
    return os.path.join(
        MODELS_DIR,
        f"{model_name}.csv"
    )


def get_installed_models():
    if not os.path.isdir(MODELS_DIR):
        return []

    models = []

    for filename in os.listdir(MODELS_DIR):

        if not filename.lower().endswith(".onnx"):
            continue

        model_name = os.path.splitext(filename)[0]

        if os.path.isfile(
            get_tag_path(model_name)
        ):
            models.append(model_name)

    return sorted(models)


# ============ 加载模型 ============

def load_model(model_name):

    if model_name in _MODEL_CACHE:
        return _MODEL_CACHE[model_name]

    model_path = get_model_path(model_name)

    if not os.path.isfile(model_path):
        raise FileNotFoundError(
            f"WD14 model not found:\n{model_path}"
        )

    session = ort.InferenceSession(
        model_path,
        providers=ORT_PROVIDERS,
    )

    _MODEL_CACHE[model_name] = session

    return session


# ============ 加载标签 ============

def load_tags(model_name):

    if model_name in _TAG_CACHE:
        return _TAG_CACHE[model_name]

    csv_path = get_tag_path(model_name)

    if not os.path.isfile(csv_path):
        raise FileNotFoundError(
            f"WD14 tag file not found:\n{csv_path}"
        )

    tags = []

    general_index = None
    character_index = None

    with open(
        csv_path,
        "r",
        encoding="utf-8",
        newline=""
    ) as file:

        reader = csv.reader(file)

        next(reader, None)

        for row in reader:

            if len(row) < 3:
                continue

            tag_id = row[0]
            tag_name = row[1]
            category = row[2]

            index = len(tags)

            if (
                general_index is None
                and category == "0"
            ):
                general_index = index

            if (
                character_index is None
                and category == "4"
            ):
                character_index = index

            tags.append({
                "id": tag_id,
                "name": tag_name,
                "category": category,
            })

    if general_index is None:
        raise RuntimeError(
            f"General tag category not found:\n"
            f"{csv_path}"
        )

    if character_index is None:
        raise RuntimeError(
            f"Character tag category not found:\n"
            f"{csv_path}"
        )

    data = {
        "tags": tags,
        "general_index": general_index,
        "character_index": character_index,
    }

    _TAG_CACHE[model_name] = data

    return data


# ============ 图像预处理 ============

def prepare_image(
    image,
    target_size
):

    image = image.convert("RGB")

    width, height = image.size

    scale = float(target_size) / max(
        width,
        height
    )

    new_width = int(width * scale)
    new_height = int(height * scale)

    image = image.resize(
        (new_width, new_height),
        Image.Resampling.LANCZOS,
    )

    canvas = Image.new(
        "RGB",
        (target_size, target_size),
        (255, 255, 255),
    )

    left = (
        target_size - new_width
    ) // 2

    top = (
        target_size - new_height
    ) // 2

    canvas.paste(
        image,
        (left, top),
    )

    image = np.asarray(
        canvas,
        dtype=np.float32,
    )

    image = image[:, :, ::-1]

    image = np.expand_dims(
        image,
        axis=0,
    )

    return image


# ============ 缓存键 ============

def make_cache_key(
    image_array,
    model_name,
    threshold,
    character_threshold,
    exclude_tags,
):

    hasher = hashlib.sha256()

    hasher.update(
        image_array.tobytes()
    )

    hasher.update(
        model_name.encode("utf-8")
    )

    hasher.update(
        str(threshold).encode("utf-8")
    )

    hasher.update(
        str(character_threshold).encode("utf-8")
    )

    hasher.update(
        exclude_tags.encode("utf-8")
    )

    return hasher.hexdigest()


# ============ 单张图像反推 ============

def tag_image(
    image,
    model_name,
    threshold,
    character_threshold,
    exclude_tags,
):

    model = load_model(model_name)

    tag_data = load_tags(model_name)

    tags = tag_data["tags"]

    general_index = (
        tag_data["general_index"]
    )

    character_index = (
        tag_data["character_index"]
    )

    input_info = model.get_inputs()[0]

    input_name = input_info.name
    input_shape = input_info.shape

    target_size = input_shape[1]

    if not isinstance(
        target_size,
        int
    ):
        target_size = 448

    input_image = prepare_image(
        image,
        target_size,
    )

    output_name = (
        model.get_outputs()[0].name
    )

    probabilities = model.run(
        [output_name],
        {
            input_name: input_image,
        },
    )[0][0]

    excluded = set()

    if exclude_tags:

        excluded = {
            tag.strip().lower()
            for tag in exclude_tags.split(",")
            if tag.strip()
        }

    # ============ General ============

    general_results = []

    for index in range(
        general_index,
        character_index,
    ):

        probability = float(
            probabilities[index]
        )

        if probability < threshold:
            continue

        tag = tags[index]["name"]

        if tag.lower() in excluded:
            continue

        general_results.append(
            (tag, probability)
        )

    # ============ Character ============

    character_results = []

    for index in range(
        character_index,
        len(tags),
    ):

        probability = float(
            probabilities[index]
        )

        if probability < character_threshold:
            continue

        tag = tags[index]["name"]

        if tag.lower() in excluded:
            continue

        character_results.append(
            (tag, probability)
        )

    # Character 在前
    results = (
        character_results
        + general_results
    )

    output_tags = []

    for tag, _ in results:

        tag = tag.replace(
            "_",
            " "
        )

        output_tags.append(tag)

    return ", ".join(output_tags)


# ============ WD14 Tagger ============

class WD14Tagger:

    NAME = "WD14 Tagger"
    CATEGORY = "Practical-Tools/image"

    @classmethod
    def INPUT_TYPES(cls):

        models = get_installed_models()

        if not models:
            models = [
                DEFAULT_MODEL
            ]

        default_model = DEFAULT_MODEL

        if default_model not in models:
            default_model = models[0]

        return {
            "required": {

                "image": (
                    "IMAGE",
                ),

                "model": (
                    models,
                    {
                        "default": default_model,
                    },
                ),

                "threshold": (
                    "FLOAT",
                    {
                        "default": DEFAULT_THRESHOLD,
                        "min": 0.0,
                        "max": 1.0,
                        "step": 0.05,
                    },
                ),

                "character_threshold": (
                    "FLOAT",
                    {
                        "default": DEFAULT_CHARACTER_THRESHOLD,
                        "min": 0.0,
                        "max": 1.0,
                        "step": 0.05,
                    },
                ),

                "exclude_tags": (
                    "STRING",
                    {
                        "default": "",
                    },
                ),
            }
        }

    RETURN_TYPES = (
        "STRING",
    )

    RETURN_NAMES = (
        "tags",
    )

    OUTPUT_IS_LIST = (
        True,
    )

    FUNCTION = "tag"

    def tag(
        self,
        image,
        model,
        threshold,
        character_threshold,
        exclude_tags,
    ):

        images = image.cpu().numpy()

        results = []

        pbar = comfy.utils.ProgressBar(
            len(images)
        )

        for img in images:

            cache_key = make_cache_key(
                img,
                model,
                threshold,
                character_threshold,
                exclude_tags,
            )

            if cache_key in _RESULT_CACHE:

                result = _RESULT_CACHE[
                    cache_key
                ]

            else:

                img_uint8 = np.clip(
                    img * 255.0,
                    0,
                    255,
                ).astype(
                    np.uint8
                )

                pil_image = Image.fromarray(
                    img_uint8,
                    "RGB",
                )

                result = tag_image(
                    image=pil_image,
                    model_name=model,
                    threshold=threshold,
                    character_threshold=character_threshold,
                    exclude_tags=exclude_tags,
                )

                _RESULT_CACHE[
                    cache_key
                ] = result

            results.append(result)

            pbar.update(1)

        return (
            results,
        )


# ============ 注册映射 ============

NODE_CLASS_MAPPINGS = {
    "wcx_WD14Tagger": WD14Tagger,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "wcx_WD14Tagger": "WD14 Tagger",
}