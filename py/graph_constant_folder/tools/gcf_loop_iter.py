# -*- coding: utf-8 -*-
"""
验证：折叠之后，第 2 次及以后的循环迭代里还会不会有开关节点。

离线调用 wcx_WhileLoopEnd.while_loop_close（它返回 expand 图），跑两轮迭代，
对比「已折叠」与「未折叠（对照）」两种提交图里 expand 的节点构成。

合成图（body 真的消费 Start.value1，否则不会被当成循环体克隆）：
  1  wcx_WhileLoopStart  condition=True, initial_value1=[6,0]
  6  LoadImage           a.png                 （循环外常量源）
  2  wcx_AnyIndexSimple  index=1, value_0=0.5, value_1=2.0
  8  ImageScale          image=[1,1], scale=[2,0]     ← 循环体：吃 Start 的值 + 开关的值
  3  wcx_WhileLoopEnd    flow=[1,0], condition=True, initial_value1=[8,0]
  4  SaveImage           images=[3,0]
"""
import copy
import importlib.util
import sys

ROOT = r"F:\Comfy-Desktop\ComfyUI-Installs\Comfy Native\ComfyUI"
PLUG = ROOT + r"\custom_nodes\ComfyUI-Practical-Tools\py"
sys.path.insert(0, ROOT)
sys.path.insert(0, PLUG)

spec = importlib.util.spec_from_file_location("gcf", PLUG + r"\graph_constant_folder\graph_constant_folder.py")
gcf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gcf)

spec2 = importlib.util.spec_from_file_location("wcx_loops", PLUG + r"\Loops.py")
loops = importlib.util.module_from_spec(spec2)
spec2.loader.exec_module(loops)


def link(nid, slot=0):
    return [str(nid), slot]


PROMPT = {
    "1": {"class_type": "wcx_WhileLoopStart", "inputs": {"condition": True, "initial_value1": link(6)}},
    "6": {"class_type": "LoadImage", "inputs": {"image": "a.png"}},
    "7": {"class_type": "ImageScale", "inputs": {"image": link(1, 1), "scale": 0.5}},
    "8": {"class_type": "ImageScale", "inputs": {"image": link(1, 1), "scale": 2.0}},
    "2": {"class_type": "wcx_AnyIndexSimple", "inputs": {"index": 1, "value_0": link(7), "value_1": link(8)}},
    "3": {"class_type": "wcx_WhileLoopEnd", "inputs": {"flow": link(1), "condition": True, "initial_value1": link(2)}},
    "4": {"class_type": "SaveImage", "inputs": {"images": link(3)}},
}


class FakeDyn:
    def __init__(self, nodes, disp=None):
        self.nodes = nodes
        self.disp = disp or {}

    def get_node(self, node_id):
        return self.nodes[str(node_id)]

    def get_display_node_id(self, node_id):
        return self.disp.get(str(node_id), str(node_id))

    def get_original_prompt(self):
        return self.nodes

    def merge(self, expand, end_display_id):
        nodes = dict(self.nodes)
        disp = dict(self.disp)
        nodes.update(expand)
        for key in expand:
            tail = key.split(".")[-1]
            disp[key] = end_display_id if tail == "Recurse" else tail
        return FakeDyn(nodes, disp)


def classes(graph):
    out = {}
    for node in graph.values():
        ct = node.get("class_type")
        out[ct] = out.get(ct, 0) + 1
    return out


def run(label, prompt, do_fold):
    prompt = copy.deepcopy(prompt)
    folded = gcf._fold_prompt({"prompt": prompt}).get("prompt", {}) if do_fold else copy.deepcopy(prompt)
    dyn = FakeDyn(folded)
    lines = ["== %s ==" % label,
             "提交图: %d 节点, 含开关=%s" % (len(folded), "wcx_AnyIndexSimple" in [n.get("class_type") for n in folded.values()])]
    flow = ["1", 0]
    end_id = "3"
    for it in (1, 2):
        res = loops.wcx_WhileLoopEnd().while_loop_close(
            flow=list(flow), condition=True, dynprompt=dyn, unique_id=end_id,
            **{"initial_value%d" % i: None for i in range(1, 21)},
        )
        expand = res["expand"]
        cls = classes(expand)
        lines.append("第 %d 轮 expand: %d 节点, 开关×%d, 类别=%s" % (
            it, len(expand), cls.get("wcx_AnyIndexSimple", 0),
            ", ".join("%s×%d" % (k, v) for k, v in sorted(cls.items()))))
        recurse = [k for k in expand if k.split(".")[-1] == "Recurse"]
        start = [k for k in expand if k.split(".")[-1] == "1"]
        if not recurse or not start:
            lines.append("  （找不到下一轮 End/Start，结束）")
            break
        dyn = dyn.merge(expand, end_id)
        flow = [start[0], 0]
        end_id = recurse[0]
    lines.append("")
    return lines


out = []
out += run("已折叠的图", PROMPT, True)
out += run("未折叠的图（对照）", PROMPT, False)
with open(r"C:\Users\29748\AppData\Local\Temp\gcf_loop_iter.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(out))
