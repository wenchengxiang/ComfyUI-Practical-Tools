"""在同一台机器上离线跑一遍 CacheKeySetInputSignature，量纯 CPU 成本。"""
import asyncio
import collections
import json
import sys
import time
import urllib.request

ROOT = r"F:\Comfy-Desktop\ComfyUI-Installs\Comfy Native\ComfyUI"
sys.path.insert(0, ROOT)

h = json.load(urllib.request.urlopen("http://127.0.0.1:8189/history?max_items=6", timeout=120))
prompt = None
for pid, item in h.items():
    p = item.get("prompt")
    if isinstance(p, list) and len(p) >= 3 and isinstance(p[2], dict) and len(p[2]) > 1000:
        prompt = p[2]
        break
assert prompt, "no folded prompt found in history"

with open(r"C:\Users\29748\AppData\Local\Temp\folded_prompt.json", "w", encoding="utf-8") as f:
    json.dump(prompt, f)

print("folded_nodes=%d bytes=%d" % (len(prompt), len(json.dumps(prompt))))


class FakeDynPrompt:
    def __init__(self, p):
        self.p = p

    def has_node(self, nid):
        return str(nid) in self.p

    def get_node(self, nid):
        return self.p[str(nid)]


class FakeChanged:
    async def get(self, node_id):
        return None


import nodes  # noqa: E402
class DummyNode:
    OUTPUT_NODE = False
    NOT_IDEMPOTENT = False

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}, "hidden": {}}


nodes.NODE_CLASS_MAPPINGS = collections.defaultdict(lambda: DummyNode)
from comfy_execution.caching import CacheKeySetInputSignature  # noqa: E402

for round_no in (1, 2):
    t0 = time.perf_counter()
    ks = CacheKeySetInputSignature(FakeDynPrompt(prompt), list(prompt.keys()), FakeChanged())
    asyncio.run(ks.add_keys(list(prompt.keys())))
    dt = time.perf_counter() - t0
    print("round%d signature_time=%.2fs keys=%d" % (round_no, dt, len(ks.keys)))
