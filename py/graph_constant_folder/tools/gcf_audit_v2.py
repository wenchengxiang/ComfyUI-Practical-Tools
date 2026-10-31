# -*- coding: utf-8 -*-
"""
GraphConstantFolder 决策审计 v2（只读）
修正 v1 的顺序问题：改写正确性在「剪枝前」的图上校验，剪枝只校验悬空/输出节点。

用法: python gcf_audit_v2.py [prompt.json]
"""
import importlib.util
import json
import os
import sys
import time

ROOT = r"F:\Comfy-Desktop\ComfyUI-Installs\Comfy Native\ComfyUI"
MOD = ROOT + r"\custom_nodes\ComfyUI-Practical-Tools\py\graph_constant_folder\graph_constant_folder.py"
DEFAULT_HIST = r"C:\Users\29748\AppData\Local\Temp\hist_prompt.json"
OUT_REPORT = r"C:\Users\29748\Doubao\PT-tools\gcf_audit_report_v2.txt"

sys.path.insert(0, ROOT)
spec = importlib.util.spec_from_file_location("gcf", MOD)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

import nodes as comfy_nodes  # 需要完整注册表判断输出来源


def load_prompt(path):
    if path.lower().endswith("hist_prompt.json"):
        raw = json.load(open(path, "r", encoding="utf-8"))
        return json.loads(json.dumps(next(iter(raw.values()))["prompt"][2]))
    data = json.load(open(path, "r", encoding="utf-8"))
    if isinstance(data, dict) and isinstance(data.get("prompt"), dict):
        return json.loads(json.dumps(data["prompt"]))
    return json.loads(json.dumps(data))


def n_outputs(class_type):
    cd = comfy_nodes.NODE_CLASS_MAPPINGS.get(class_type)
    if cd is None:
        return None
    rt = getattr(cd, "RETURN_TYPES", None)
    return len(rt) if rt else 0


def is_output_node(class_type):
    cd = comfy_nodes.NODE_CLASS_MAPPINGS.get(class_type)
    return bool(cd is not None and getattr(cd, "OUTPUT_NODE", False) is True)


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_HIST
    prompt = load_prompt(src)
    total_before = len(prompt)

    decisions = []
    folded = set()
    cache = {}
    t0 = time.perf_counter()

    for pass_idx in range(16):
        replacements, count, _c, _n = m._constant_fold_switches(prompt, folded)
        if count == 0:
            break
        for nid, rep in replacements.items():
            node = prompt.get(nid, {})
            inputs = node.get("inputs", {}) or {}
            idx = m._resolve_constant(prompt, inputs.get("index"), "int", cache)
            flag = m._resolve_constant(prompt, inputs.get("switch"), "bool", cache)
            port = None
            if isinstance(idx, int):
                for k in ("value_%d" % idx, "value%d" % idx):
                    if k in inputs:
                        port = k
                        break
            elif isinstance(flag, bool):
                port = "on_true" if flag else "on_false"
            decisions.append({
                "pass": pass_idx, "id": nid, "class": str(node.get("class_type", "")),
                "idx": idx if isinstance(idx, int) else flag, "port": port, "target": rep,
            })
        m._apply_replacements(prompt, replacements)
        folded.update(replacements.keys())

    fold_ms = (time.perf_counter() - t0) * 1000.0

    # ---------- 校验 A：剪枝前的改写正确性 ----------
    bad_missing, bad_slot, slot_ok = [], [], 0
    for d in decisions:
        tgt = d["target"]
        if isinstance(tgt, list) and len(tgt) == 2 and isinstance(tgt[1], int):
            sid, slot = str(tgt[0]), tgt[1]
            node = prompt.get(sid)
            if node is None:
                bad_missing.append("决策 #%s(%s) -> 不存在 %s" % (d["id"], d["class"], sid))
                continue
            n = n_outputs(node.get("class_type", ""))
            if n is None:
                slot_ok += 1  # 未注册的类（如子图实例），无法判定，跳过
            elif slot >= n:
                bad_slot.append("决策 #%s(%s) 槽 %d，但 %s(%s) 只有 %d 个输出" % (
                    d["id"], d["class"], slot, sid, node.get("class_type"), n))
            else:
                slot_ok += 1
        else:
            slot_ok += 1  # 折叠成字面量（如同时接了常量）

    # 端口一致性：value_N 的 N 必须等于解析出的 index
    port_mismatch = []
    for d in decisions:
        if d["port"] and d["port"].startswith("value") and isinstance(d["idx"], int):
            digits = d["port"][6:] if d["port"].startswith("value_") else d["port"][5:]
            if digits.isdigit() and int(digits) != d["idx"]:
                port_mismatch.append("决策 #%s 端口 %s 与 index %d 不一致" % (d["id"], d["port"], d["idx"]))

    # ---------- 剪枝 ----------
    pre_prune = len(prompt)
    start_nodes = m._collect_outputs(prompt, m._extract_partial_targets({})) if m._PRUNE else set()
    removed = 0
    if m._PRUNE and start_nodes:
        prompt, removed = m._prune_unreachable(prompt, start_nodes)

    dangling = []
    for nid, node in prompt.items():
        if not isinstance(node, dict):
            continue
        for k, v in (node.get("inputs") or {}).items():
            if isinstance(v, list) and len(v) == 2 and isinstance(v[1], int) and str(v[0]) not in prompt:
                dangling.append("%s.%s -> %s" % (nid, k, v[0]))

    pruned_outputs = [nid for nid in start_nodes if nid not in prompt]

    lines = [
        "来源: %s" % src,
        "节点: %d -> 折叠后 %d -> 剪枝后 %d（剪掉 %d）" % (total_before, pre_prune, len(prompt), removed),
        "折叠决策: %d 条，耗时 %.1f ms" % (len(decisions), fold_ms),
        "按类: " + ", ".join("%s=%d" % (c, sum(1 for d in decisions if d["class"] == c))
                            for c in sorted({d["class"] for d in decisions})),
        "",
        "A. 剪枝前：改写正确性",
        "  目标节点不存在: %d" % len(bad_missing),
        "  输出槽位越界: %d" % len(bad_slot),
        "  槽位/字面量正常: %d" % slot_ok,
        "  value_N 与 index 不一致: %d" % len(port_mismatch),
        "",
        "B. 剪枝后：图完整性",
        "  悬空连线: %d" % len(dangling),
        "  被剪掉的输出节点: %d" % len(pruned_outputs),
        "",
    ]
    for title, items in (("A 问题", bad_missing + bad_slot + port_mismatch), ("B 问题", dangling + pruned_outputs)):
        if items:
            lines.append("%s（最多 20 条）:" % title)
            lines.extend("  " + x for x in items[:20])
            lines.append("")

    lines.append("决策样本（前 20 条）:")
    lines.append("  %-5s %-22s %-8s %-12s %s" % ("pass", "class", "id", "决策值", "端口 -> 目标"))
    for d in decisions[:20]:
        tgt = d["target"]
        ts = ("%s[%s]" % (tgt[0], tgt[1])) if isinstance(tgt, list) and len(tgt) == 2 else str(tgt)[:20]
        lines.append("  %-5s %-22s %-8s %-12s %s -> %s" % (d["pass"], d["class"][:22], d["id"], d["idx"], d["port"], ts))

    report = "\n".join(lines)
    print(report)
    open(OUT_REPORT, "w", encoding="utf-8").write(report)
    print("\n报告: %s" % OUT_REPORT)


if __name__ == "__main__":
    main()
