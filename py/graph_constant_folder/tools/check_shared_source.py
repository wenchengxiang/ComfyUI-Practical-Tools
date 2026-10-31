# -*- coding: utf-8 -*-
"""
验证：某一路（未被选中的 value_N）的源节点，
      如果还被别的“非开关”节点消费，会不会被误删。

A. 合成用例：精确复现提问场景
B. 真实工作流：统计所有“未选中的 value_N 源节点”的去留与原因
"""
import importlib.util
import json
import sys
import urllib.request

ROOT = r"F:\Comfy-Desktop\ComfyUI-Installs\Comfy Native\ComfyUI"
MOD = ROOT + r"\custom_nodes\ComfyUI-Practical-Tools\py\graph_constant_folder\graph_constant_folder.py"
sys.path.insert(0, ROOT)

spec = importlib.util.spec_from_file_location("gcf", MOD)
gcf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gcf)


def run_case(with_extra_consumer):
    prompt = {
        "1": {"class_type": "wcx_AnyIndexSimple",
              "inputs": {"index": 1, "value_0": ["10", 0], "value_1": ["11", 0], "value_3": ["12", 0]}},
        "10": {"class_type": "SrcUnused", "inputs": {}},
        "11": {"class_type": "SrcPicked", "inputs": {}},
        "12": {"class_type": "SrcShared", "inputs": {"x": ["13", 0]}},
        "13": {"class_type": "UpstreamOfShared", "inputs": {}},
        "21": {"class_type": "ConsumerOfSwitch", "inputs": {"v": ["1", 0]}},
        "30": {"class_type": "Out", "inputs": {"img": ["21", 0]}},
        "40": {"class_type": "DeadViewer", "inputs": {"x": ["12", 0]}},
    }
    if with_extra_consumer:
        prompt["20"] = {"class_type": "LiveOtherConsumer", "inputs": {"a": ["12", 0]}}
        prompt["21"]["inputs"]["extra"] = ["20", 0]

    reps, cnt, _c, _n = gcf._constant_fold_switches(prompt, set())
    gcf._apply_replacements(prompt, reps)
    kept, removed = gcf._prune_unreachable(prompt, {"30"})

    dangling = 0
    for nid, node in kept.items():
        for k, v in (node.get("inputs") or {}).items():
            if isinstance(v, list) and len(v) == 2 and isinstance(v[1], int) and str(v[0]) not in kept:
                dangling += 1

    print("  折叠 %d 条；保留 %d 个；删除: %s" % (cnt, len(kept), sorted(set(prompt) - set(kept))))
    print("  共享源 12 是否保留: %s    其上游 13 是否保留: %s    未选中源 10 是否保留: %s"
          % ("12" in kept, "13" in kept, "10" in kept))
    print("  开关下游 21 现在接的是: %r（应为 ['11', 0]）" % (kept.get("21", {}).get("inputs", {}).get("v"),))
    print("  悬空连线: %d" % dangling)
    return kept


print("== A1. 共享源只喂开关 + 一个死节点（没有别的活消费者）==")
run_case(False)

print("\n== A2. 共享源同时喂开关和一个活的非开关节点（提问场景）==")
run_case(True)

# ---------- B. 真实工作流 ----------
raw = json.load(open(r"C:\Users\29748\AppData\Local\Temp\hist_prompt.json", encoding="utf-8"))
orig = json.loads(json.dumps(next(iter(raw.values()))["prompt"][2]))
prompt = json.loads(json.dumps(orig))

oi = json.load(urllib.request.urlopen("http://127.0.0.1:8189/object_info", timeout=120))
out_classes = {k for k, v in oi.items() if v.get("output_node") is True}
output_ids = {nid for nid, n in prompt.items() if n.get("class_type") in out_classes}

decisions = []
folded = set()
for _ in range(16):
    reps, cnt, _c, _n = gcf._constant_fold_switches(prompt, folded)
    if cnt == 0:
        break
    decisions.extend(reps.items())
    gcf._apply_replacements(prompt, reps)
    folded.update(reps.keys())

kept, removed = gcf._prune_unreachable(prompt, output_ids)

# 统计“未选中的 value_N 源节点”
selected_sources = set()
unselected_sources = set()
for nid, rep in decisions:
    node = orig.get(nid, {})
    inputs = node.get("inputs", {}) or {}
    sel = rep[0] if isinstance(rep, list) else None
    if sel:
        selected_sources.add(sel)
    for k, v in inputs.items():
        if k.startswith("value") and isinstance(v, list) and len(v) == 2 and isinstance(v[1], int):
            if str(v[0]) != str(sel):
                unselected_sources.add(str(v[0]))

unselected_sources -= selected_sources

survived, pruned = [], []
for sid in unselected_sources:
    (survived if sid in kept else pruned).append(sid)


def live_consumers(node_id, graph):
    n = 0
    for other, node in graph.items():
        if other == node_id:
            continue
        for v in (node.get("inputs") or {}).values():
            if isinstance(v, list) and len(v) == 2 and isinstance(v[1], int) and str(v[0]) == node_id:
                n += 1
    return n


bad = [sid for sid in survived if live_consumers(sid, kept) == 0 and sid not in output_ids]
dangling = 0
for nid, node in kept.items():
    for k, v in (node.get("inputs") or {}).items():
        if isinstance(v, list) and len(v) == 2 and isinstance(v[1], int) and str(v[0]) not in kept:
            dangling += 1

print("\n== B. 真实工作流（2410 节点）==")
print("  折叠 %d 条；剪枝后 %d 个节点" % (len(decisions), len(kept)))
print("  未被选中的 value_N 源节点: %d 个" % len(unselected_sources))
print("    保留: %d（其中在剪后图里仍有消费者: %d）" % (len(survived), len(survived) - len(bad)))
print("    删除: %d（这些在剪后图里已无任何活消费者）" % len(pruned))
print("  异常（保留却没人用、也不是输出）: %d %s" % (len(bad), bad[:5]))
print("  悬空连线: %d" % dangling)
print("  被删的共享源里，是否还有活消费者: %s"
      % ("有（问题！）" if any(live_consumers(s, kept) for s in pruned) else "无"))
