# -*- coding: utf-8 -*-
r"""Contact sheet of transitions: one row per transition, the columns are progress values.

    python Tools/transgen/transheet.py OUT.jpg Name1,Name2,... [d1,d2,...] [--scene Kaleidoscope.frag] [--images DIR]

Scene A is the scene (default Kaleidoscope.frag), scene B the next photo of the image directory; the transition is rendered by
PresetEditor --render with --trans d.  Default progress values: 0.15 0.3 0.5 0.7 0.85.
"""
import argparse, os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
PE = os.path.join(ROOT, "PresetEditor", "build", "Release", "PresetEditor.exe")

ap = argparse.ArgumentParser()
ap.add_argument("out")
ap.add_argument("names")
ap.add_argument("ds", nargs="?", default="0.15,0.3,0.5,0.7,0.85")
ap.add_argument("--scene", default="Kaleidoscope.frag")
ap.add_argument("--images", default=os.path.join(ROOT, "Tools", "probe_images"))
ap.add_argument("--w", type=int, default=240)
ap.add_argument("--h", type=int, default=135)
ap.add_argument("--time", default="12")
a = ap.parse_args()
names = a.names.split(",")
ds = [float(x) for x in a.ds.split(",")]
tmp = os.path.join(HERE, "_sheet_tmp")
os.makedirs(tmp, exist_ok=True)


def render(job):
    n, d, out = job
    cmd = [PE, "--render", a.scene, "Transitions/%s.frag" % n, out, str(a.w), str(a.h), "--images", a.images,
           "--trans", "%g" % d, "--time", a.time]
    # one render at a time and below normal priority: the machine may be in use (a game on the same GPU)
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=120, cwd=os.path.join(ROOT, "Release"),
                       creationflags=getattr(subprocess, "BELOW_NORMAL_PRIORITY_CLASS", 0))
    return (r.stdout + r.stderr)[-200:] if "OK" not in (r.stdout + r.stderr) else ""


jobs = [(n, d, os.path.join(tmp, "%s_%03d.png" % (n, int(d * 100)))) for n in names for d in ds]
with ThreadPoolExecutor(int(os.environ.get("TRANSHEET_JOBS", "1"))) as ex:
    res = list(ex.map(render, jobs))
for j, r in zip(jobs, res):
    if r:
        print("ERR", j[0], j[1], r.strip()[:150])
sheet = Image.new("RGB", (len(ds) * a.w, len(names) * (a.h + 14)), (30, 30, 30))
dr = ImageDraw.Draw(sheet)
for i, n in enumerate(names):
    dr.text((3, i * (a.h + 14)), "%s   d = %s" % (n, " ".join("%g" % d for d in ds)), fill=(255, 255, 140))
    for c, d in enumerate(ds):
        p = os.path.join(tmp, "%s_%03d.png" % (n, int(d * 100)))
        if os.path.exists(p):
            sheet.paste(Image.open(p).convert("RGB").resize((a.w, a.h)), (c * a.w, i * (a.h + 14) + 14))
sheet.save(a.out, quality=82)
print(a.out)
