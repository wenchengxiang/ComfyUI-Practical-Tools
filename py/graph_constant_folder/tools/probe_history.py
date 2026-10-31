import json
import urllib.request

BASE = "http://127.0.0.1:8189"
out = []

h = json.load(urllib.request.urlopen(BASE + "/history?max_items=6", timeout=120))
out.append("history_entries=%d" % len(h))
for pid, item in list(h.items())[:6]:
    prompt = item.get("prompt")
    nodes = 0
    cls_unknown = 0
    if isinstance(prompt, list) and len(prompt) >= 3 and isinstance(prompt[2], dict):
        nodes = len(prompt[2])
        cls_unknown = sum(1 for n in prompt[2].values() if n.get("class_type") == "DefinitelyNotANode")
    status = item.get("status", {})
    msgs = status.get("messages", []) or []
    stamps = []
    for m in msgs:
        if isinstance(m, list) and len(m) == 2 and isinstance(m[1], dict) and "timestamp" in m[1]:
            stamps.append((m[0], m[1]["timestamp"]))
    out.append("%s nodes_in_prompt=%d unknown=%d status=%s msgs=%s"
               % (pid[:8], nodes, cls_unknown, status.get("status_str"), [s[0] for s in stamps][:6]))
    if stamps:
        t0 = stamps[0][1]
        for name, t in stamps:
            out.append("    %-22s +%.2fs" % (name, (t - t0) / 1000.0))

with open(r"C:\Users\29748\AppData\Local\Temp\init_probe.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(out))
