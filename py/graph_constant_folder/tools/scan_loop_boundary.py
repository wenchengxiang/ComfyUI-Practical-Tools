# -*- coding: utf-8 -*-
"""③ 补充：检查是否存在 loop_boundary 类节点（官方调度会额外照顾的边界节点）。"""
import sys

sys.path.insert(0, r"F:\Comfy-Desktop\ComfyUI-Installs\Comfy Native\ComfyUI")
import nodes as comfy_nodes  # noqa: E402

outputs = 0
boundaries = []
for cls, cd in comfy_nodes.NODE_CLASS_MAPPINGS.items():
    if getattr(cd, "OUTPUT_NODE", False) is True:
        outputs += 1
    try:
        schema = cd.GET_SCHEMA() if hasattr(cd, "GET_SCHEMA") else None
        b = getattr(schema, "loop_boundary", None) if schema is not None else None
        if b:
            boundaries.append((cls, b))
    except Exception:
        pass

print("注册类总数: %d" % len(comfy_nodes.NODE_CLASS_MAPPINGS))
print("OUTPUT_NODE=True 的类: %d" % outputs)
print("loop_boundary 非空的类: %d" % len(boundaries))
for cls, b in boundaries[:20]:
    print("  %s -> %s" % (cls, b))
