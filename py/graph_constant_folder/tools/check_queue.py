import json
import urllib.request

base = "http://127.0.0.1:8189"
q = json.load(urllib.request.urlopen(base + "/queue", timeout=30))
h = json.load(urllib.request.urlopen(base + "/history", timeout=60))
lines = [
    "queue_running=%d queue_pending=%d" % (len(q.get("queue_running", [])), len(q.get("queue_pending", []))),
    "history_entries=%d" % len(h),
]
ids = list(h.keys())[-3:]
for pid in ids:
    entry = h[pid]
    status = entry.get("status", {})
    lines.append("prompt=%s status=%s msgs=%s" % (pid, status.get("status_str"), [m[0] for m in status.get("messages", [])][:8]))
    p = entry.get("prompt")
    if p and len(p) > 2:
        lines.append("  nodes=%d" % len(p[2]))
with open(r"C:\Users\29748\AppData\Local\Temp\bu_queue_state.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(lines))
