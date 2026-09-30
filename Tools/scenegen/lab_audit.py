# -*- coding: utf-8 -*-
"""Chain-lab audit: measure many rolls and find the weak stage classes.

Reads quick/audit_<Scene>/<i>.png (rendered by the shell loop in the usage
below) plus the matching knob lines, measures each frame -- mean brightness,
contrast (luma std), detail (mean gradient magnitude) and colourfulness
(Hasler-Suesstrunk) -- and prints the averages per class of every rolled knob,
so a class that makes dark, flat or muddy pictures stands out.

Usage (Git Bash, in Tools/scenegen):
  python labroll.py SEED N > quick/audit_rolls.txt
  mkdir -p quick/audit_X; i=0; while read -r ps; do bash q2.sh X 40 "$ps" 1; \
    cp quick/X_q1.png quick/audit_X/$i.png; i=$((i+1)); done < quick/audit_rolls.txt
  python lab_audit.py X quick/audit_rolls.txt
"""
import sys, os
import numpy as np
from PIL import Image

scene, rolls = sys.argv[1], sys.argv[2]
CLASSES = {"chainAP": 18, "chainBP": 7, "chainCP": 10, "chainDP": 6, "styleP": 5,
           "spaceP": 8, "coreP": 9, "bodyP": 7}
rows = []
for i, line in enumerate(open(rolls, encoding="utf-8").read().splitlines()):
    f = os.path.join("quick", "audit_" + scene, "%d.png" % i)
    if not os.path.exists(f):
        continue
    im = np.asarray(Image.open(f).convert("RGB").resize((480, 270)), dtype=np.float32) / 255.0
    y = im @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    gy, gx = np.gradient(y)
    rg = im[..., 0] - im[..., 1]
    yb = 0.5 * (im[..., 0] + im[..., 1]) - im[..., 2]
    colourful = np.hypot(rg.std(), yb.std()) + 0.3 * np.hypot(rg.mean(), yb.mean())
    kv = dict(p.split("=", 1) for p in line.split())
    rows.append((i, kv, y.mean(), y.std(), np.hypot(gx, gy).mean() * 100.0, colourful))
if not rows:
    sys.exit("no frames")
m = np.array([r[2:] for r in rows])
print("%d frames   mean: bright %.3f  contrast %.3f  detail %.2f  colour %.3f" % ((len(rows),) + tuple(m.mean(0))))
print("weakest frames (bright*contrast):")
for r in sorted(rows, key=lambda r: r[2] * r[3])[:6]:
    print("  #%-3d bright %.3f contrast %.3f detail %.2f colour %.3f  %s" % (r[0], r[2], r[3], r[4], r[5],
          " ".join("%s=%s" % (k, v) for k, v in r[1].items() if k in CLASSES)))
for k, n in CLASSES.items():
    if not any(k in r[1] for r in rows):
        continue
    print("%s:" % k)
    for c in range(n):
        sel = [r for r in rows if k in r[1] and min(int(float(r[1][k]) * n), n - 1) == c]
        if sel:
            a = np.array([s[2:] for s in sel]).mean(0)
            flag = "  <-- dark" if a[0] < 0.6 * m[:, 0].mean() else ("  <-- flat" if a[2] < 0.6 * m[:, 2].mean() else "")
            print("   %2d  n=%-3d bright %.3f contrast %.3f detail %.2f colour %.3f%s" % ((c, len(sel)) + tuple(a) + (flag,)))
