import json
import time
import urllib.request
import uuid

BASE = "http://127.0.0.1:8189"
out = []

prompt = json.load(open(r"C:\Users\29748\AppData\Local\Temp\folded_prompt.json", encoding="utf-8"))


def walk(p, nid, anc, mp):
    node = p.get(nid)
    if node is None:
        return
    for k in sorted((node.get("inputs") or {}).keys()):
        v = node["inputs"][k]
        if isinstance(v, list) and len(v) == 2 and isinstance(v[1], int):
            a = str(v[0])
            if a not in mp:
                anc.append(a)
                mp[a] = len(anc) - 1
                walk(p, a, anc, mp)


total = 0
for nid in prompt:
    anc, mp = [], {}
    walk(prompt, nid, anc, mp)
    total += len(anc)
out.append("nodes=%d ancestor_expansions=%s" % (len(prompt), format(total, ",")))

body = json.dumps({"prompt": prompt, "client_id": str(uuid.uuid4())}).encode("utf-8")
req = urllib.request.Request(BASE + "/prompt", data=body, headers={"Content-Type": "application/json"}, method="POST")
pid = json.load(urllib.request.urlopen(req, timeout=120))["prompt_id"]
out.append("submitted pid=%s" % pid)

deadline = time.time() + 90
interrupted = False
seen = {}
while time.time() < deadline:
    h = json.load(urllib.request.urlopen(BASE + "/history/" + pid, timeout=60))
    item = h.get(pid)
    if item:
        for m in item.get("status", {}).get("messages", []) or []:
            if isinstance(m, list) and len(m) == 2 and isinstance(m[1], dict):
                seen.setdefault(m[0], m[1].get("timestamp"))
        if "execution_cached" in seen and not interrupted:
            urllib.request.urlopen(urllib.request.Request(BASE + "/interrupt", data=b"", method="POST"), timeout=30)
            interrupted = True
        if "execution_interrupted" in seen or item.get("status", {}).get("status_str") == "success":
            break
    time.sleep(1)

if "execution_start" in seen and "execution_cached" in seen:
    out.append("server start->cached = %.2fs" % ((seen["execution_cached"] - seen["execution_start"]) / 1000.0))
else:
    out.append("incomplete: %s" % json.dumps({k: v for k, v in seen.items()})[:300])

with open(r"C:\Users\29748\AppData\Local\Temp\init_probe.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(out))
