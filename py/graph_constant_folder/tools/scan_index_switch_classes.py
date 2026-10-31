# -*- coding: utf-8 -*-
"""
扫描当前 ComfyUI 注册表：哪些节点类会被 GraphConstantFolder 的「端口名」规则认出。
判定依据与插件一致：
  索引型：inputs 同时含 index + (value_0,value_1) 或 (value0,value1)
另外打印每类的 index 规格（min/default）和输出个数，便于判断是否 0 基。
"""
import json
import sys
import urllib.request

URL = "http://127.0.0.1:8189/object_info"


def spec_of(inputs, key):
    v = inputs.get(key)
    if isinstance(v, list) and v:
        return v[0]
    return v


def detail(inputs, key):
    v = inputs.get(key)
    if isinstance(v, list) and len(v) > 1 and isinstance(v[1], dict):
        return v[1]
    return {}


def main():
    data = json.load(urllib.request.urlopen(URL, timeout=120))
    print("注册节点类总数: %d" % len(data))

    hits = []
    for cls, obj in data.items():
        inp = obj.get("input", {}) or {}
        merged = {}
        merged.update(inp.get("required", {}) or {})
        merged.update(inp.get("optional", {}) or {})
        keys = set(merged.keys())

        if "index" not in keys:
            continue
        style = None
        if {"value_0", "value_1"} <= keys:
            style = "value_N"
        elif {"value0", "value1"} <= keys:
            style = "valueN"
        if not style:
            continue

        idx_detail = detail(merged, "index")
        n_out = len(obj.get("output", []) or [])
        n_val = sum(1 for k in keys if k.startswith("value"))
        hits.append({
            "class": cls,
            "style": style,
            "index_type": spec_of(merged, "index"),
            "min": idx_detail.get("min"),
            "max": idx_detail.get("max"),
            "default": idx_detail.get("default"),
            "outputs": n_out,
            "value_count": n_val,
            "module": obj.get("python_module", ""),
        })

    hits.sort(key=lambda x: (x["module"], x["class"]))
    print("会被端口名规则认出的类: %d" % len(hits))
    print("")
    print("%-26s %-8s %-6s %-6s %-8s %-8s %-6s %s" % ("class", "端口样式", "type", "min", "default", "输出数", "value数", "模块"))
    for h in hits:
        print("%-26s %-8s %-6s %-6s %-8s %-8s %-6s %s" % (
            h["class"][:26], h["style"], h["index_type"], h["min"], h["default"],
            h["outputs"], h["value_count"], h["module"] or "-"))

    non_own = [h for h in hits if h["module"] != "graph_constant_folder" and not h["class"].startswith(("wcx_AnyIndex", "AnyIndex"))]
    print("")
    print("非本项目来源的候选: %d" % len(non_own))
    for h in non_own:
        print("  %s  index min=%s 输出=%s 模块=%s" % (h["class"], h["min"], h["outputs"], h["module"] or "-"))

    single_out_non_own = [h for h in non_own if h["outputs"] == 1]
    print("")
    print("其中「单输出」（最容易被误折）: %d" % len(single_out_non_own))
    for h in single_out_non_own:
        print("  %s  index min=%s" % (h["class"], h["min"]))


if __name__ == "__main__":
    main()
