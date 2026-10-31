# -*- coding: utf-8 -*-
"""量化「提交后缓存判定」的真实成本：祖先展开次数 与 每节点签名工作量。"""
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


def walk_ancestry(prompt, node_id, ancestors, mapping):
    """与 caching.py:get_ordered_ancestry_internal 同构：每个节点单独从头 DFS。"""
    node = prompt.get(node_id)
    if node is None:
        return
    for key in sorted((node.get("inputs") or {}).keys()):
        v = node["inputs"][key]
        if isinstance(v, list) and len(v) == 2 and isinstance(v[1], int):
            aid = str(v[0])
            if aid not in mapping:
                ancestors.append(aid)
                mapping[aid] = len(ancestors) - 1
                walk_ancestry(prompt, aid, ancestors, mapping)


def cost(prompt):
    total_anc = 0
    total_sig_rows = 0
    total_input_items = 0
    for nid, node in prompt.items():
        anc, mp = [], {}
        walk_ancestry(prompt, nid, anc, mp)
        total_anc += len(anc)
        total_sig_rows += 1 + len(anc)   # 自己 + 每个祖先各生成一条 immediate signature
        for aid in [nid] + anc:
            total_input_items += len((prompt.get(aid, {}).get("inputs") or {}))
    return total_anc, total_sig_rows, total_input_items


def count_descendants(prompt, roots):
    children = {}
    for nid, node in prompt.items():
        for v in (node.get("inputs") or {}).values():
            if isinstance(v, list) and len(v) == 2 and isinstance(v[1], int):
                children.setdefault(str(v[0]), set()).add(nid)
    seen = set()
    stack = list(roots)
    while stack:
        cur = stack.pop()
        for c in children.get(cur, ()):
            if c not in seen:
                seen.add(c)
                stack.append(c)
    return len(seen)


raw = json.load(open(r"C:\Users\29748\AppData\Local\Temp\hist_prompt.json", encoding="utf-8"))
orig = json.loads(json.dumps(next(iter(raw.values()))["prompt"][2]))

oi = json.load(urllib.request.urlopen("http://127.0.0.1:8189/object_info", timeout=120))
out_classes = {k for k, v in oi.items() if v.get("output_node") is True}
output_ids = {nid for nid, n in orig.items() if n.get("class_type") in out_classes}

a0, s0, i0 = cost(orig)
print("原始: 节点 %d，祖先展开 %s 次，签名行 %s 行，输入项 %s 个"
      % (len(orig), format(a0, ","), format(s0, ","), format(i0, ",")))

prompt = json.loads(json.dumps(orig))
decisions = 0
folded_ids = []
folded = set()
while True:
    reps, cnt, _c, _n = gcf._constant_fold_switches(prompt, folded)
    if cnt == 0:
        break
    decisions += cnt
    folded_ids.extend(reps.keys())
    folded.update(reps.keys())
    gcf._apply_replacements(prompt, reps)

desc = count_descendants(orig, folded_ids)
kept, removed = gcf._prune_unreachable(prompt, output_ids)
a1, s1, i1 = cost(kept)
print("折叠 %d 个开关（决策 %d 条），它们原来的下游节点合计 %d 个" % (len(folded_ids), decisions, desc))
print("折叠+剪枝后: 节点 %d，祖先展开 %s 次，签名行 %s 行，输入项 %s 个"
      % (len(kept), format(a1, ","), format(s1, ","), format(i1, ",")))
print("缩减倍数: 祖先展开 %.2fx，签名行 %.2fx，输入项 %.2fx，节点数 %.2fx"
      % (a0 / max(a1, 1), s0 / max(s1, 1), i0 / max(i1, 1), len(orig) / max(len(kept), 1)))
print("实测耗时倍数: 29.9 / 7.87 = %.2fx" % (29.9 / 7.87))
