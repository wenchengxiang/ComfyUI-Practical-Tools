# -*- coding: utf-8 -*-
"""
循环工作流下 GraphConstantFolder 的行为验证（离线，不起服务）。

对比两套机制：
  官方：StartLoop/EndLoop，Start 与 End 之间没有数据边（EndLoop 只接 output_value）
  本插件：wcx_WhileLoopStart/End、wcx_ForLoopStart/End，End 的 flow 输入是 rawLink，
          直接指向 Start（[start_id, 0]），这条边本身就把 Start 挂在输出链上

每个用例都检查：剪枝后 Start/End 是否成对、End 的 flow 指向的节点是否还在。
"""
import importlib.util
import json
import sys

ROOT = r"F:\Comfy-Desktop\ComfyUI-Installs\Comfy Native\ComfyUI"
MOD = ROOT + r"\custom_nodes\ComfyUI-Practical-Tools\py\graph_constant_folder\graph_constant_folder.py"
sys.path.insert(0, ROOT)

spec = importlib.util.spec_from_file_location("gcf", MOD)
gcf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gcf)


def link(nid, slot=0):
    return [str(nid), slot]


def sw(index, ports):
    inputs = {"index": index}
    inputs.update(ports)
    return {"class_type": "wcx_AnyIndexSimple", "inputs": inputs}


def check(name, prompt, start_id, end_id):
    return check_pairs(name, prompt, [(start_id, end_id)])


def check_pairs(name, prompt, pairs):
    out = gcf._fold_prompt({"prompt": prompt}).get("prompt", {})
    kept = sorted(out.keys(), key=lambda x: int(x) if x.isdigit() else 0)
    pruned = [k for k in prompt if k not in out]
    detail = []
    all_pair = True
    all_flow = True
    for s, e in pairs:
        pair = (s in out) == (e in out)
        flow_ok = None
        if e in out:
            flow = out[e].get("inputs", {}).get("flow")
            flow_ok = bool(flow) and str(flow[0]) in out
        all_pair = all_pair and pair
        all_flow = all_flow and bool(flow_ok)
        detail.append("%s/%s 成对=%s flow=%s" % (s, e, pair, flow_ok))
    return {
        "name": name,
        "count": "%d -> %d" % (len(prompt), len(out)),
        "pruned": pruned,
        "pair": all_pair,
        "flow_ok": all_flow if all_flow else detail,
        "kept": kept,
    }


cases = []

# ---- 官方 A/B（对照组，机制不同） ----
cases.append(check("官方 A：Start 被 body 正常消费", {
    "1": {"class_type": "StartLoop", "inputs": {"num_iterations": 4}},
    "5": {"class_type": "LoadImage", "inputs": {"image": "a.png"}},
    "6": {"class_type": "LoadImage", "inputs": {"image": "b.png"}},
    "2": sw(1, {"value_0": link(5), "value_1": link(6)}),
    "7": {"class_type": "ImageScale", "inputs": {"image": link(2), "iteration": link(1, 1)}},
    "3": {"class_type": "EndLoop", "inputs": {"output_value": link(7)}},
    "4": {"class_type": "SaveImage", "inputs": {"images": link(3)}},
}, "1", "3"))

cases.append(check("官方 B：只有未选中分支消费 Start", {
    "1": {"class_type": "StartLoop", "inputs": {"num_iterations": 4}},
    "5": {"class_type": "LoadImage", "inputs": {"image": "a.png"}},
    "6": {"class_type": "LoadImage", "inputs": {"image": "b.png"}},
    "8": {"class_type": "ImageScale", "inputs": {"image": link(5), "iteration": link(1, 1)}},
    "2": sw(1, {"value_0": link(8), "value_1": link(6)}),
    "7": {"class_type": "ImageScale", "inputs": {"image": link(2)}},
    "3": {"class_type": "EndLoop", "inputs": {"output_value": link(7)}},
    "4": {"class_type": "SaveImage", "inputs": {"images": link(3)}},
}, "1", "3"))

# ---- 本插件 While：body 里的 8 只被未选中分支使用，Start 只靠 flow 边连到 End ----
cases.append(check("wcx While：未选中分支才消费 Start.value1", {
    "1": {"class_type": "wcx_WhileLoopStart", "inputs": {"condition": True, "initial_value1": link(6)}},
    "6": {"class_type": "LoadImage", "inputs": {"image": "a.png"}},
    "7": {"class_type": "LoadImage", "inputs": {"image": "b.png"}},
    "8": {"class_type": "ImageScale", "inputs": {"image": link(6), "idx": link(1, 1)}},
    "2": sw(1, {"value_0": link(8), "value_1": link(7)}),
    "3": {"class_type": "wcx_WhileLoopEnd", "inputs": {"flow": link(1), "condition": False, "initial_value1": link(2)}},
    "4": {"class_type": "SaveImage", "inputs": {"images": link(3)}},
}, "1", "3"))

# ---- 本插件 For：End 的 flow 直接指 ForLoopStart ----
cases.append(check("wcx For：开关吃掉 body 唯一一条用 index 的路", {
    "1": {"class_type": "wcx_ForLoopStart", "inputs": {"total": 4, "initial_value1": link(6)}},
    "6": {"class_type": "LoadImage", "inputs": {"image": "a.png"}},
    "7": {"class_type": "LoadImage", "inputs": {"image": "b.png"}},
    "8": {"class_type": "ImageScale", "inputs": {"image": link(6), "index": link(1, 1)}},
    "2": sw(1, {"value_0": link(8), "value_1": link(7)}),
    "3": {"class_type": "wcx_ForLoopEnd", "inputs": {"flow": link(1), "initial_value1": link(2)}},
    "4": {"class_type": "SaveImage", "inputs": {"images": link(3)}},
}, "1", "3"))

# ---- 嵌套：外层 While 里再套内层 While，开关在内层 body ----
cases.append(check_pairs("wcx 嵌套 While：内外两层边界", {
    "1": {"class_type": "wcx_WhileLoopStart", "inputs": {"condition": True, "initial_value1": link(6)}},
    "6": {"class_type": "LoadImage", "inputs": {"image": "a.png"}},
    "11": {"class_type": "wcx_WhileLoopStart", "inputs": {"condition": True, "initial_value1": link(1, 1)}},
    "12": {"class_type": "LoadImage", "inputs": {"image": "b.png"}},
    "8": {"class_type": "ImageScale", "inputs": {"image": link(6), "idx": link(11, 1)}},
    "2": sw(1, {"value_0": link(8), "value_1": link(12)}),
    "13": {"class_type": "wcx_WhileLoopEnd", "inputs": {"flow": link(11), "condition": False, "initial_value1": link(2)}},
    "3": {"class_type": "wcx_WhileLoopEnd", "inputs": {"flow": link(1), "condition": False, "initial_value1": link(13)}},
    "4": {"class_type": "SaveImage", "inputs": {"images": link(3)}},
}, [("1", "3"), ("11", "13")]))

lines = []
for c in cases:
    lines.append("== %s ==" % c["name"])
    lines.append("节点 %s | 剪掉: %s" % (c["count"], c["pruned"] or "无"))
    lines.append("Start/End 成对: %s | End.flow 目标仍在: %s" % (c["pair"], c["flow_ok"]))
    lines.append("")

with open(r"C:\Users\29748\AppData\Local\Temp\gcf_loop_check.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(lines))
