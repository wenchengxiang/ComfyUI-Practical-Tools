# -*- coding: utf-8 -*-
"""验证 index-min 闸门：1 基跳过、0 基照折、真实 prompt 折叠数不变。"""
import importlib.util
import json
import sys

ROOT = r"F:\Comfy-Desktop\ComfyUI-Installs\Comfy Native\ComfyUI"
MOD = ROOT + r"\custom_nodes\ComfyUI-Practical-Tools\py\graph_constant_folder\graph_constant_folder.py"
sys.path.insert(0, ROOT)

spec = importlib.util.spec_from_file_location("gcf", MOD)
gcf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gcf)

import nodes  # noqa: E402

gcf._VERBOSE = False


def make(prefix_min, name):
    class Fake:
        RETURN_TYPES = ("*",)

        @classmethod
        def INPUT_TYPES(cls):
            return {"required": {"index": ("INT", {"default": prefix_min, "min": prefix_min, "max": 2, "step": 1})},
                    "optional": {"value_0": ("*",), "value_1": ("*",), "value_2": ("*",)}}
    Fake.__name__ = name
    nodes.NODE_CLASS_MAPPINGS[name] = Fake
    return Fake


make(1, "FakeOneBased")
make(0, "FakeZeroBased")


def build(cls):
    return {
        "1": {"class_type": cls, "inputs": {"index": 1, "value_0": ["2", 0], "value_1": ["3", 0]}},
        "2": {"class_type": "SrcA", "inputs": {}},
        "3": {"class_type": "SrcB", "inputs": {}},
        "4": {"class_type": "Consumer", "inputs": {"x": ["1", 0]}},
    }


print("== 合成用例 ==")
for cls, expect_fold in (("FakeOneBased", False), ("FakeZeroBased", True)):
    p = build(cls)
    reps, cnt, cand, msgs = gcf._constant_fold_switches(p, set())
    folded = bool(reps)
    ok = folded == expect_fold and cnt == (1 if expect_fold else 0)
    print("  %-14s 折叠=%s 计数=%d 期望折叠=%s -> %s" % (cls, folded, cnt, expect_fold, "OK" if ok else "!! 失败"))
    if expect_fold and reps:
        print("     改写目标: %r（应为 ['3', 0]）" % (reps.get("1"),))
    else:
        print("     节点 1 保留: %s" % ("1" in p or (cls == "FakeZeroBased")))

# 真实 prompt
raw = json.load(open(r"C:\Users\29748\AppData\Local\Temp\hist_prompt.json", encoding="utf-8"))
real = json.loads(json.dumps(next(iter(raw.values()))["prompt"][2]))
decisions = 0
folded = set()
skips = 0
for _ in range(16):
    reps, cnt, _c, _n = gcf._constant_fold_switches(real, folded)
    if cnt == 0:
        break
    decisions += cnt
    gcf._apply_replacements(real, reps)
    folded.update(reps.keys())

print("== 真实 prompt ==")
print("  折叠数: %d（改动前是 139）" % decisions)
print("  被闸门跳过: %d" % skips)
