import json
import urllib.request
import uuid

BASE = "http://127.0.0.1:8189"
out = []


def get(path, timeout=120):
    return json.load(urllib.request.urlopen(BASE + path, timeout=timeout))


def post(path, payload, timeout=120):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        return json.load(urllib.request.urlopen(req, timeout=timeout))
    except urllib.error.HTTPError as e:
        return {"http_error": e.code, "body": e.read().decode("utf-8", "replace")[:2000]}


stats = get("/system_stats")
out.append("comfyui_version=%s python=%s torch=%s" % (
    stats.get("system", {}).get("comfyui_version"),
    stats.get("system", {}).get("python_version", "")[:8],
    stats.get("system", {}).get("pytorch_version"),
))

oi = get("/object_info")
for name in ("PrimitiveInt", "wcx_IntPassthrough", "PreviewAny", "wcx_AnyIndexSimple", "INTConstant"):
    if name in oi:
        req = oi[name].get("input", {}).get("required", {})
        opt = oi[name].get("input", {}).get("optional", {})
        out.append("%s required=%s optional=%s output_node=%s" % (
            name, list(req.keys()), list(opt.keys()), oi[name].get("output_node")))
    else:
        out.append("%s = NOT REGISTERED" % name)

prompt = {
    "1": {"class_type": "wcx_AnyIndexSimple",
          "inputs": {"index": 0, "value_0": ["10", 0], "value_1": ["11", 0]}},
    "10": {"class_type": "PrimitiveInt", "inputs": {"value": 7}},
    "11": {"class_type": "DefinitelyNotANode", "inputs": {}},
    "20": {"class_type": "PreviewAny", "inputs": {"source": ["1", 0]}},
}
res = post("/prompt", {"prompt": prompt, "client_id": str(uuid.uuid4())})
out.append("probe_response=%s" % json.dumps(res, ensure_ascii=False)[:600])

with open(r"C:\Users\29748\AppData\Local\Temp\init_probe.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(out))
