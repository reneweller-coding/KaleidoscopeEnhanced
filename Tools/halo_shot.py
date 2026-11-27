# -*- coding: utf-8 -*-
"""halo_shot.py -- FxRimLight's halo (knob haloP, 27.11.2026) on frozen frames: off against on.

Renders each scene with FX/FxRimLight.frag as Tools/scene_snapshots.py's shot does (fixed steps, silent, the fixed
photo, KALEIDO_SEED 7), once per haloP value.  The preset entry always carries the haloP line (minValue = maxValue =
the value, also for 0), so every run rolls the same numbers; haloP 0 takes the old code path.  Prints, per scene and
value, how the frame differs from haloP 0 and writes a sheet (the frames side by side, then |difference| x 4).

    python Tools/halo_shot.py OUTDIR --scenes PillarHall FoldLab --halo 0 1 2

The old shader against the new one without the knob: Tools/depth_arc.py frozen <label> --fx FxRimLight (it takes the
old file from .screen/fxold).  Run both through the machine's heavy-job lock, one after the other (both write
Presets/_snap0.xml).  A silent shot has audioSwell 0: the halo stands at 0.3 of its full strength.
"""
import argparse
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import depth_arc  # noqa: E402
import scene_snapshots as ss  # noqa: E402
from private_settings import PrivateSettings  # noqa: E402


def main():
    """Render the frames, print the differences, write the sheets."""
    from PIL import Image
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("out", help="folder for the JPGs")
    ap.add_argument("--scenes", nargs="+", default=["PillarHall", "FoldLab"])
    ap.add_argument("--halo", nargs="+", type=float, default=[0.0, 1.0, 2.0])
    ap.add_argument("--photo", default=depth_arc.PHOTO)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    ss.PS = PrivateSettings("haloshot")
    bl = depth_arc.blocks()
    for sc in a.scenes:
        pics = []
        for v in a.halo:
            line = '  <float name="haloP" minValue="%g" maxValue="%g"></float>' % (v, v)
            blk = bl["FxRimLight"].replace("</CombineShader>", line + chr(10) + "  </CombineShader>")
            f = os.path.join(a.out, "%s_halo%g.jpg" % (sc, v))
            r = ss.shoot(bl[sc], blk, f, a.photo, 60)
            print("%s haloP %g: %s" % (sc, v, r or "no frame"), flush=True)
            pics.append(np.asarray(Image.open(f).convert("RGB"), np.int16) if r else None)
        if any(p is None for p in pics):
            continue
        row = [p.astype(np.uint8) for p in pics]
        for v, p in zip(a.halo[1:], pics[1:]):
            d = p - pics[0]
            print("%s haloP %g against %g: max %d, mean %+.3f of 255, %.2f %% of the pixels changed by more than 2, "
                  "brightest pixel %d -> %d" % (sc, v, a.halo[0], np.abs(d).max(), d.mean(),
                                               100.0 * (np.abs(d).max(axis=2) > 2).mean(), pics[0].max(), p.max()),
                  flush=True)
            row.append(np.clip(np.abs(d) * 4, 0, 255).astype(np.uint8))
        Image.fromarray(np.concatenate(row, axis=1)).save(os.path.join(a.out, "%s_sheet.jpg" % sc), quality=90)
    snap = os.path.join(ss.ROOT, "Presets", "_snap0.xml")
    if os.path.exists(snap):
        os.remove(snap)


if __name__ == "__main__":
    main()
