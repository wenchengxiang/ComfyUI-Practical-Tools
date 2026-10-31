# -*- coding: utf-8 -*-
"""
GraphConstantFolder 决策审计（只读，不改插件、不改图）
用法:
    python gcf_audit.py [prompt.json]
不给参数时读 C:\\Users\\29748\\AppData\\Local\\Temp\\hist_prompt.json

做四件事:
1. 复盘每一轮折叠，列出 每个被折节点 -> 选中的端口 -> 接到的目标
2. 校验改写后的连线：目标节点必须存在、输出槽位必须合法
3. 校验剪枝后不存在悬空连线
4. 校验剪枝没有删掉输出节点
"""
import importlib.util
import json
import os
import sys
import time

ROOT = r"F:\Comfy-Desktop\ComfyUI-Installs\Comfy Native\ComfyUI"
MOD = ROOT + r"\custom_nodes\ComfyUI-Practical-Tools\py\graph_constant_folder\graph_constant_folder.py"
DEFAULT_HIST = r"C:\Users\29748\AppData\Local\Temp\hist_prompt.json"
OUT_REPORT = r"C:\Users\29748\Doubao\PT-tools\gcf_audit_report.txt"

sys.path.insert(0, ROOT)

spec = importlib.util.spec_from_file_location("gcf", MOD)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def load_prompt(path):
    if path.lower().endswith("hist_prompt.json"):
        raw = json.load(open(path, "r", encoding="utf-8"))
        first = next(iter(raw.values()))
        return json.loads(json.dumps(first["prompt"][2]))
    data = json.load(open(path, "r", encoding="utf-8"))
    if isinstance(data, dict) and "prompt" in data and isinstance(data["prompt"], dict):
        return json.loads(json.dumps(data["prompt"]))
    if isinstance(data, dict) and all(isinstance(v, dict) for v in data.values()):
        return json.loads(json.dumps(data))
    raise SystemExit("无法识别的 prompt 结构")


def out_count(class_type):
    try:
        import nodes as comfy_nodes
    except Exception:
        return None
    cd = comfy_nodes.NODE_CLASS_MAPPINGS.get(class_type)
    if cd is None:
        return None
    rt = getattr(cd, "RETURN_TYPES", None)
    return len(rt) if rt else None


def is_output_node(class_type):
    try:
        import nodes as comfy_nodes
    except Exception:
        return False
    cd = comfy_nodes.NODE_CLASS_MAPPINGS.get(class_type)
    return bool(cd is not None and getattr(cd, "OUTPUT_NODE", False) is True)


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_HIST
    prompt = load_prompt(src)
    total_before = len(prompt)
    print("来源: %s" % src)
    print("原始节点数: %d" % total_before)

    decisions = []
    folded = set()
    cache = {}
    t0 = time.perf_counter()

    for pass_idx in range(16):
        replacements, count, cands, _nf = m._constant_fold_switches(prompt, folded)
        if count == 0:
            break
        for nid, rep in replacements.items():
            node = prompt.get(nid, {})
            inputs = node.get("inputs", {}) or {}
            cls = str(node.get("class_type", ""))
            raw_index = inputs.get("index", inputs.get("switch", None))
            idx = m._resolve_constant(prompt, raw_index, "int", cache)
            flag = m._resolve_constant(prompt, raw_index, "bool", cache)
            port = None
            if isinstance(idx, int):
                for k in ("value_%d" % idx, "value%d" % idx):
                    if k in inputs:
                        port = k
                        break
            elif isinstance(flag, bool):
                port = "on_true" if flag else "on_false"
            target = rep
            decisions.append({
                "pass": pass_idx,
                "id": nid,
                "class": cls,
                "raw": raw_index,
                "idx": idx if isinstance(idx, int) else flag,
                "port": port,
                "target": target,
            })
        m._apply_replacements(prompt, replacements)
        folded.update(replacements.keys())

    t_fold = (time.perf_counter() - t0) * 1000.0

    # 剪枝
    pruned_before = len(prompt)
    targets_partial = m._extract_partial_targets({})
    start_nodes = m._collect_outputs(prompt, targets_partial) if m._PRUNE else set()
    if m._PRUNE and start_nodes:
        prompt, removed = m._prune_unreachable(prompt, start_nodes)
    else:
        removed = 0

    # ---- 校验 ----
    problems = []
    for d in decisions:
        tgt = d["target"]
        if isinstance(tgt, list) and len(tgt) == 2 and isinstance(tgt[1], int):
            sid = str(tgt[0])
            if sid not in prompt and sid not in folded:
                problems.append("决策 #%s 接到不存在的节点 %s" % (d["id"], sid))
            else:
                n = out_count(prompt.get(sid, {}).get("class_type", ""))
                if n is not None and tgt[1] >= n:
                    problems.append("决策 #%s 用了非法输出槽 %s（该节点只有 %d 个输出）" % (d["id"], tgt[1], n))
            if tgt[1] != 0:
                problems.append("决策 #%s 接到槽 %d（被折节点都是单输出，应为 0）" % (d["id"], tgt[1]))

    dangling = []
    for nid, node in prompt.items():
        if not isinstance(node, dict):
            continue
        for k, v in (node.get("inputs") or {}).items():
            if isinstance(v, list) and len(v) == 2 and isinstance(v[1], int):
                if str(v[0]) not in prompt:
                    dangling.append("%s.%s -> %s" % (nid, k, v[0]))

    pruned_outputs = []
    if m._PRUNE and start_nodes:
        for nid in start_nodes:
            if nid not in prompt:
                pruned_outputs.append(nid)

    # ---- 报告 ----
    lines = []
    lines.append("来源: %s" % src)
    lines.append("节点: %d -> %d（剪掉 %d）" % (total_before, len(prompt), total_before - len(prompt)))
    lines.append("折叠决策: %d 条，折叠耗时 %.1f ms" % (len(decisions), t_fold))
    classes = {}
    for d in decisions:
        classes[d["class"]] = classes.get(d["class"], 0) + 1
    lines.append("按类分布: %s" % ", ".join("%s=%d" % (k, v) for k, v in sorted(classes.items(), key=lambda x: -x[1])))
    lines.append("")
    lines.append("校验结果:")
    lines.append("  悬空连线(剪枝后目标不存在): %d" % len(dangling))
    lines.append("  输出槽位非法: %d" % sum(1 for p in problems if "非法输出槽" in p or "应为 0" in p))
    lines.append("  接到不存在节点: %d" % sum(1 for p in problems if "不存在的节点" in p))
    lines.append("  被剪掉的输出节点: %d" % len(pruned_outputs))
    if problems:
        lines.append("")
        lines.append("问题明细(最多 20 条):")
        lines.extend("  " + p for p in problems[:20])
    if dangling:
        lines.append("")
        lines.append("悬空明细(最多 20 条):")
        lines.extend("  " + x for x in dangling[:20])
    lines.append("")
    lines.append("决策明细（前 30 条 / 共 %d）:" % len(decisions))
    lines.append("  %-8s %-26s %-6s %-10s %-14s %s" % ("pass", "class", "id", "index", "port", "target"))
    for d in decisions[:30]:
        tgt = d["target"]
        ts = ("%s[%s]" % (tgt[0], tgt[1])) if isinstance(tgt, list) and len(tgt) == 2 else str(tgt)[:24]
        lines.append("  %-8s %-26s %-6s %-10s %-14s %s" % (d["pass"], d["class"][:26], d["id"], d["idx"], d["port"], ts))

    report = "\n".join(lines)
    print("")
    print(report)
    os.makedirs(os.path.dirname(OUT_REPORT), exist_ok=True)
    open(OUT_REPORT, "w", encoding="utf-8").write(report)
    print("")
    print("报告已写入: %s" % OUT_REPORT)


if __name__ == "__main__":
    main()
