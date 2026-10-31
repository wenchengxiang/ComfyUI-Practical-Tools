import json
import urllib.request

oi = json.load(urllib.request.urlopen("http://127.0.0.1:8189/object_info", timeout=180))
keys = list(oi.keys())
lines = [
    "classes=%d" % len(keys),
    "wcx_AnyIndexSimple=%s" % ("wcx_AnyIndexSimple" in oi),
    "ComfySwitchNode=%s" % ("ComfySwitchNode" in oi),
    "CustomCombo=%s" % ("CustomCombo" in oi),
    "fold_family=%s" % [k for k in keys if k.lower().startswith("wcx_anyindex")],
]
with open(r"C:\Users\29748\AppData\Local\Temp\handover_check.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(str(x) for x in lines))
