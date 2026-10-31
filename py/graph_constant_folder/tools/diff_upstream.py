# -*- coding: utf-8 -*-
"""⑥ 量化我们与上游的分叉程度。"""
import difflib
import io
import re

UP = r"E:\29748\下载\ComfyUI-GraphConstantFolder-main\graph_constant_folder.py"
OURS = r"F:\Comfy-Desktop\ComfyUI-Installs\Comfy Native\ComfyUI\custom_nodes\ComfyUI-Practical-Tools\py\graph_constant_folder\graph_constant_folder.py"

up = io.open(UP, "r", encoding="utf-8").read().splitlines()
ours = io.open(OURS, "r", encoding="utf-8").read().splitlines()

print("上游: %d 行 / %d B" % (len(up), len(io.open(UP, encoding="utf-8").read())))
print("本地: %d 行 / %d B" % (len(ours), len(io.open(OURS, encoding="utf-8").read())))

sm = difflib.SequenceMatcher(None, up, ours, autojunk=False)
added = removed = 0
hunks = []
for tag, i1, i2, j1, j2 in sm.get_opcodes():
    if tag == "equal":
        continue
    added += j2 - j1
    removed += i2 - i1
    hunks.append((tag, i1 + 1, i2, j1 + 1, j2))

print("相似度: %.3f" % sm.ratio())
print("相对上游：新增 %d 行，删除/改写 %d 行，差异块 %d 处" % (added, removed, len(hunks)))

print("\n差异块位置（上游行号 -> 本地区间）:")
for tag, i1, i2, j1, j2 in hunks:
    print("  %-8s 上游 %d-%d  ->  本地 %d-%d" % (tag, i1, i2, j1, j2))

# 本地新增的函数名
up_funcs = set(re.findall(r"^def (\w+)", "\n".join(up), re.M))
our_funcs = set(re.findall(r"^def (\w+)", "\n".join(ours), re.M))
new_funcs = sorted(our_funcs - up_funcs)
gone_funcs = sorted(up_funcs - our_funcs)
print("\n本地新增函数: %s" % (", ".join(new_funcs) if new_funcs else "无"))
print("上游有而本地没有: %s" % (", ".join(gone_funcs) if gone_funcs else "无"))
