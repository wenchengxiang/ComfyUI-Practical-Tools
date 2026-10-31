import collections

path = r"C:\Users\29748\AppData\Local\Temp\pyspy_raw.txt"
lines = [l.rstrip("\n") for l in open(path, encoding="utf-8", errors="replace") if l.strip()]

total = 0
frame_weight = collections.Counter()
leaf_weight = collections.Counter()
for line in lines:
    parts = line.rsplit(" ", 1)
    if len(parts) != 2:
        continue
    stack, cnt = parts
    try:
        n = int(cnt)
    except ValueError:
        continue
    frames = [f.strip() for f in stack.split(";") if f.strip()]
    if not frames:
        continue
    total += n
    for f in frames:
        frame_weight[f] += n
    leaf_weight[frames[-1]] += n

out = ["samples=%d" % total, "", "== leaf frames (where time actually sits) =="]
for f, n in leaf_weight.most_common(10):
    out.append("%6.1f%%  %s" % (100.0 * n / max(total, 1), f))
out += ["", "== frames on stack (top 15) =="]
for f, n in frame_weight.most_common(15):
    out.append("%6.1f%%  %s" % (100.0 * n / max(total, 1), f))

with open(r"C:\Users\29748\AppData\Local\Temp\pyspy_summary.txt", "w", encoding="utf-8") as fh:
    fh.write("\n".join(out))
