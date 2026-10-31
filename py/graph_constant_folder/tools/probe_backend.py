import json
import urllib.request
import time

base = "http://127.0.0.1:8189"
out = []
for path in ("/system_stats", "/queue"):
    t0 = time.time()
    try:
        d = json.load(urllib.request.urlopen(base + path, timeout=120))
        if path == "/queue":
            out.append("queue: running=%d pending=%d" % (len(d.get("queue_running", [])), len(d.get("queue_pending", []))))
        else:
            out.append("system_stats OK device=%s" % d["devices"][0]["name"])
        out.append("  %s latency=%.2fs" % (path, time.time() - t0))
    except Exception as e:
        out.append("%s FAIL %s" % (path, e))

with open(r"C:\Users\29748\AppData\Local\Temp\init_probe.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(out))
