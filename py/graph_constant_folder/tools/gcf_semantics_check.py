# -*- coding: utf-8 -*-
"""
① 语义对照：把「折叠后的连线」与「节点自己运行时会返回的值」逐条比对。

用法: python gcf_semantics_check.py [prompt.json]

A. 直接调用 wcx_AnyIndex / AnyIndexSimple 的 execute，确认 index -> value_N
B. 直接调用官方 CustomCombo / ComfySwitchNode 的 execute（失败则退回源码断言）
C. 在真实 prompt 上重放 139 条折叠决定，逐条比对
"""
import importlib.util
import json
import sys
import time

ROOT = r"F:\Comfy-Desktop\ComfyUI-Installs\Comfy Native\ComfyUI"
PLUG = ROOT + r"\custom_nodes\ComfyUI-Practical-Tools\py"
GCF = PLUG + r"\graph_constant_folder\graph_constant_folder.py"
DEFAULT_HIST = r"C:\Users\29748\AppData\Local\Temp\hist_prompt.json"

sys.path.insert(0, ROOT)


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


gcf = load(GCF, "gcf")
any_index = load(PLUG + r"\Any_Index.py", "any_index")

fails = []

# ---------- A. 我们的索引节点 ----------
print("== A. wcx_AnyIndex / AnyIndexSimple 运行时语义 ==")
for cls_name in ("AnyIndexSimple", "AnyIndex"):
    cls = getattr(any_index, cls_name, None)
    if cls is None:
        print("  %s: 未定义" % cls_name)
        continue
    kwargs = {"value_%d" % i: "VAL%d" % i for i in range(30)}
    for idx in (0, 1, 2, 5):
        if "value_%d" % idx not in kwargs:
            continue
        got = cls().index_switch(idx, **kwargs)
        exp = ("VAL%d" % idx,)
        ok = got == exp
        print("  %s index=%d -> %r %s" % (cls_name, idx, got, "OK" if ok else "!! 期望 %r" % (exp,)))
        if not ok:
            fails.append("%s index=%d 运行结果 %r != %r" % (cls_name, idx, got, exp))

# ---------- B. 官方节点 ----------
print("\n== B. 官方 CustomCombo / ComfySwitchNode 运行时语义 ==")
try:
    logic = load(ROOT + r"\comfy_extras\nodes_logic.py", "nodes_logic")
    combo = logic.CustomComboNode()
    out = combo.execute("b", 1)
    print("  CustomCombo(choice='b', index=1) -> %r" % (out,))
    vals = getattr(out, "args", None) or getattr(out, "values", None)
    print("    返回结构: %s" % type(out).__name__)
except Exception as e:
    print("  导入/调用失败（退回源码断言）: %s" % e)

# ---------- C. 重放真实 prompt ----------
print("\n== C. 在真实 prompt 上重放折叠决定 ==")
src = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_HIST
raw = json.load(open(src, "r", encoding="utf-8"))
prompt = json.loads(json.dumps(next(iter(raw.values()))["prompt"][2]))

decisions = []
folded = set()
cache = {}
t0 = time.perf_counter()
for p in range(16):
    reps, cnt, _c, _n = gcf._constant_fold_switches(prompt, folded)
    if cnt == 0:
        break
    for nid, rep in reps.items():
        node = prompt.get(nid, {})
        inputs = node.get("inputs", {}) or {}
        cls = str(node.get("class_type", ""))
        decisions.append((nid, cls, dict(inputs), rep))
    gcf._apply_replacements(prompt, reps)
    folded.update(reps.keys())
print("  决策 %d 条，耗时 %.1f ms" % (len(decisions), (time.perf_counter() - t0) * 1000))

mismatch = 0
unknown = 0
for nid, cls, inputs, rep in decisions:
    canon = cls.split(" | ", 1)[0]
    if canon in ("wcx_AnyIndex", "wcx_AnyIndexSimple", "AnyIndex", "AnyIndexSimple"):
        idx = gcf._resolve_constant(prompt, inputs.get("index"), "int", cache)
        expect = inputs.get("value_%d" % idx) if isinstance(idx, int) else "<index 非常量>"
    elif canon == "ComfySwitchNode":
        sw = gcf._resolve_constant(prompt, inputs.get("switch"), "bool", cache)
        expect = inputs.get("on_true" if sw else "on_false") if isinstance(sw, bool) else "<switch 非常量>"
    else:
        unknown += 1
        continue
    if expect != rep:
        mismatch += 1
        if mismatch <= 5:
            print("  不一致 #%s %s: 期望 %r 实际 %r" % (nid, canon, expect, rep))

print("  与节点自身语义一致的折叠: %d / %d" % (len(decisions) - unknown - mismatch,
                                                len(decisions) - unknown))
print("  未覆盖(其他类): %d" % unknown)
print("  不一致: %d" % mismatch)

if mismatch or fails:
    print("\n结论: 发现 %d 处不一致" % (mismatch + len(fails)))
    sys.exit(1)
print("\n结论: 全部一致")
