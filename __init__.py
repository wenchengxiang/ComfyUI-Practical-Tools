import importlib.util
import os
import sys

# 获取当前文件夹的绝对路径
current_dir = os.path.dirname(os.path.abspath(__file__))

# 确保当前文件夹被注入到系统的高优先级路径中
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

# 自动发现所有节点文件
node_files = [f for f in os.listdir(current_dir) 
             if f.endswith('.py') and not f.startswith('__')]

for node_file in node_files:
    module_name = node_file[:-3]  # 移除.py
    file_path = os.path.join(current_dir, node_file)
    
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

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS']
