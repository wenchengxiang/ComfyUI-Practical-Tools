# -*- coding: utf-8 -*-
"""③ 用「运行中的注册表」校验剪枝：输出节点集合是否与官方一致、剪完是否一个不少。"""
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

raw = json.load(open(r"C:\Users\29748\AppData\Local\Temp\hist_prompt.json", encoding="utf-8"))
prompt = json.loads(json.dumps(next(iter(raw.values()))["prompt"][2]))
total = len(prompt)

oi = json.load(urllib.request.urlopen("http://127.0.0.1:8189/object_info", timeout=120))
out_classes = {k for k, v in oi.items() if v.get("output_node") is True}

classes_in_prompt = {n.get("class_type") for n in prompt.values()}
missing = sorted(c for c in classes_in_prompt if c not in oi)
output_ids = {nid for nid, n in prompt.items() if n.get("class_type") in out_classes}

print("prompt 节点: %d，涉及类: %d" % (total, len(classes_in_prompt)))
print("注册表里未找到的类: %d %s" % (len(missing), missing[:5]))
print("官方口径的输出节点（类 OUTPUT_NODE=True）: %d 个，涉及类: %s"
      % (len(output_ids), sorted({prompt[i]['class_type'] for i in output_ids})))

# 折叠
folded = set()
decisions = 0
for _ in range(16):
    reps, cnt, _c, _n = gcf._constant_fold_switches(prompt, folded)
    if cnt == 0:
        break
    decisions += cnt
    gcf._apply_replacements(prompt, reps)
    folded.update(reps.keys())

before_prune = len(prompt)
kept, removed = gcf._prune_unreachable(prompt, output_ids)
print("折叠: %d 条；剪枝: %d -> %d（删 %d）" % (decisions, before_prune, len(kept), removed))

survived = [i for i in output_ids if i in kept]
print("剪枝后仍存在的输出节点: %d / %d" % (len(survived), len(output_ids)))

dangling = 0
for nid, node in kept.items():
    for k, v in (node.get("inputs") or {}).items():
        if isinstance(v, list) and len(v) == 2 and isinstance(v[1], int) and str(v[0]) not in kept:
            dangling += 1
print("悬空连线: %d" % dangling)

# 交叉校验：官方执行闭包（从输出节点向上走）是否与 kept 完全一致
official_closure = gcf._walk_upstream(prompt, set(output_ids))
print("官方闭包大小: %d；与剪枝结果一致: %s" % (len(official_closure), set(official_closure) == set(kept)))
