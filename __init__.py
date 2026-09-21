import os
import sys
import shutil

import folder_paths

# 获取当前文件夹的绝对路径
current_dir = os.path.dirname(os.path.abspath(__file__))

# 确保当前文件夹被注入到系统的高优先级路径中
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

# ============ 静态导入所有节点（标准方式，支持 ComfyUI 内置扩展管理器静态扫描） ============
from .py import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

# ============ 自动复制素材到 input 文件夹（每次补回） ============

def _copy_assets_to_input():
    assets_dir = os.path.join(current_dir, "assets")
    if not os.path.isdir(assets_dir):
        return
    try:
        input_dir = folder_paths.get_input_directory()
    except Exception:
        return
    os.makedirs(input_dir, exist_ok=True)
    for filename in os.listdir(assets_dir):
        src = os.path.join(assets_dir, filename)
        dst = os.path.join(input_dir, filename)
        if os.path.isfile(src) and not os.path.isfile(dst):
            try:
                shutil.copy2(src, dst)
            except Exception:
                pass

_copy_assets_to_input()

# 告诉 ComfyUI 加载js文件夹所有 .js 前端文件
WEB_DIRECTORY = "./js"

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS']
