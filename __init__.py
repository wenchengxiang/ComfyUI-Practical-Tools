import importlib.util
import os
import sys
import shutil

import folder_paths

# 获取当前文件夹的绝对路径
current_dir = os.path.dirname(os.path.abspath(__file__))

# 确保当前文件夹被注入到系统的高优先级路径中
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

# 自动发现所有节点文件
nodes_dir = os.path.join(current_dir, "py")
if not os.path.isdir(nodes_dir):
    nodes_dir = current_dir
node_files = []
for root, _dirs, files in os.walk(nodes_dir):
    if '__pycache__' in root:
        continue
    node_files.extend(os.path.join(root, f) for f in files
                      if f.endswith('.py') and not f.startswith('__'))

for node_file in node_files:
    module_name = os.path.basename(node_file)[:-3]  # 移除.py
    file_path = node_file
    
    try:
        # 改用绝对路径的 spec 动态加载，模仿 ComfyUI 官方加载外部 custom_nodes 的最稳妥逻辑
        spec = importlib.util.spec_from_file_location(module_name, file_path)
        if spec and spec.loader:
            module = importlib.util.module_from_spec(spec)
            sys.modules[module_name] = module
            spec.loader.exec_module(module)
            
            # 检查并合并注册映射
            if hasattr(module, 'NODE_CLASS_MAPPINGS') and hasattr(module, 'NODE_DISPLAY_NAME_MAPPINGS'):
                NODE_CLASS_MAPPINGS.update(module.NODE_CLASS_MAPPINGS)
                NODE_DISPLAY_NAME_MAPPINGS.update(module.NODE_DISPLAY_NAME_MAPPINGS)
    except Exception as e:
        # 如果报错，打印在控制台，方便我们一眼看出是哪个节点内部写错了
        print(f"\n[WCX Nodes Error] 节点文件 {node_file} 加载失败，错误原因: {e}\n")

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
