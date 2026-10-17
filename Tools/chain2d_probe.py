"""Which 2D chains of the flat labs (ChainLab2D, FxChain) turn the picture into mush or a blur -> Engine/chain2d_classes.tsv.

The 2D lab rolls a chain of four stages (A 58 classes, B 23, C 18, D 20, in one of 24 orders): far too many to try
them all.  This probe tries 16384 random chains (four PresetEditor frames of 64 x 64, every pixel a chain; the
editor's command-line render shows no window and takes no focus) and measures, at 8 x 5 screen points, the Jacobian
of the chain's mirrored photo coordinate (finite differences over one pixel at 1080 lines) in photo pixels per
screen pixel (the photo 1024 wide):

  mush   share of points where the photo is shrunk more than 8x in every direction: mip-averaged to one colour or
         a grain (the inversion fractals, the sphere kaleidoscope, the theta wave, the Newton map)
  flat   share of points where it is magnified more than 6.7x in every direction: a blur of one patch

(Streaks -- one direction compressed, the other stretched -- were measured too and dropped: looked at, those chains
were nearly all calm flowing bands.)  Looked at, the 12 highest chains by mush were 8 times poor, by flat 6 times.
A chain counts as poor above 0.7 in either; 4.4 % of the random chains.  Which chain is poor is close to additive in
its stages' classes (R^2 0.70 for mush, 0.30 for flat), so the table holds a ridge fit: an intercept and one
contribution per class and measure.  EffectShader::chainPoorness() sums them for a rolled or walked chain and keeps
the flat labs off chains predicted above 0.5 (6.3 % of the chains; 49 % of those are poor, 71 % of the poor ones
are caught -- a wrong catch only moves one stage to another class); KALEIDO_NO_CHAIN_FILTER switches that off.

    python Tools/chain2d_probe.py          (after changing a 2D stage class or the flat labs' chain)
"""
import io
import os
import re
import subprocess
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "Tools", "scenegen"))
import chain_classes as cc  # noqa: E402

OUT = os.path.join(ROOT, "Engine", "chain2d_classes.tsv")
KNOBS = ["chainAP", "chainBP", "chainCP", "chainDP", "orderP"]
STAGES = KNOBS[:4]
FRAMES, SIDE = 4, 64
POOR, LAMBDA = 0.7, 2.0

PROBE = r"""
uint hashU(uint x) { x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u; return x; }
float rndU(uint i, uint k) { return float(hashU(i * 8u + k) >> 8u) / 16777216.0; }
void main()
{
    ivec2 ip = ivec2(gl_FragCoord.xy);
    if (ip.x >= 64 || ip.y >= 64) { fragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
    uint i = uint(BASE + ip.y * 64 + ip.x);
    chainAP = rndU(i, 0u); chainBP = rndU(i, 1u); chainCP = rndU(i, 2u); chainDP = rndU(i, 3u); orderP = rndU(i, 4u);
    tiltP = 0.0;
    float st = 30.0;                                       // the lab's main at sceneTime 30
    gT = (0.03 + 0.06 * 0.5) * st;
    gSpread = 0.4;
    gRot = 0.02 * st;
    gMw = 0.012 * st;
    gCw = vec2(0.5) + 0.15 * vec2(sin(0.017 * st), cos(0.013 * st));
    gCt = vec2(0.5) + vec2(0.22 * sin(0.023 * st + 0.3 * sin(0.011 * st)), 0.16 * cos(0.019 * st));
    float e = 1.0 / 1080.0;
    int nFlat = 0, nMush = 0;
    for (int gx = 0; gx < 8; ++gx)
        for (int gy = 0; gy < 5; ++gy) {
            vec2 p = vec2(-0.8 + 1.6 * (float(gx) + 0.5) / 8.0, -0.42 + 0.84 * (float(gy) + 0.5) / 5.0);
            vec2 m0 = mirrorUV(chain(p)), mx = mirrorUV(chain(p + vec2(e, 0.0))), my = mirrorUV(chain(p + vec2(0.0, e)));
            mat2 J = mat2(mx - m0, my - m0) * 1024.0;           // photo pixels per screen pixel
            float a = J[0][0], b = J[1][0], c = J[0][1], d = J[1][1];
            float s1 = a * a + b * b + c * c + d * d, dt = abs(a * d - b * c);
            float r = sqrt(max(s1 * s1 - 4.0 * dt * dt, 0.0));
            float smax = sqrt(0.5 * (s1 + r)), smin = sqrt(max(0.5 * (s1 - r), 0.0));
            if (smax < 0.15) ++nFlat;
            if (smin > 8.0) ++nMush;
        }
    fragColor = vec4(float(nMush) / 40.0, float(nFlat) / 40.0, 0.0, 1.0);
}
"""


def hashU(x):
    x &= 0xffffffff
    x ^= x >> 16
    x = (x * 0x7feb352d) & 0xffffffff
    x ^= x >> 15
    x = (x * 0x846ca68b) & 0xffffffff
    x ^= x >> 16
    return x


def rnd(i, k):
    return float(hashU(i * 8 + k) >> 8) / 16777216.0


def measure():
    lab = io.open(os.path.join(ROOT, "Scene2D", "ChainLab2D.frag"), encoding="utf-8").read()
    lab = lab[:lab.rindex("void main()")]
    for k in KNOBS + ["tiltP"]:                             # the knobs become per-pixel variables
        lab, n = re.subn(r"^uniform float %s;" % k, "float %s;" % k, lab, flags=re.M)
        assert n == 1, k
    rows = []
    frag = os.path.join(ROOT, "_chain2d_probe.frag")
    png = os.path.join(ROOT, "_chain2d_probe.png")
    try:
        for f in range(FRAMES):
            base = f * SIDE * SIDE
            io.open(frag, "w", encoding="utf-8", newline="\n").write(lab + PROBE.replace("BASE", str(base)))
            r = subprocess.run([os.path.join(ROOT, "PresetEditor", "build", "Release", "PresetEditor.exe"), "--render",
                                "_chain2d_probe.frag", "CombinePlain.frag", png, str(SIDE), str(SIDE), "--time", "30"],
                               cwd=os.path.join(ROOT, "Release"), capture_output=True, text=True, timeout=600)
            if "OK" not in r.stdout + r.stderr:
                sys.exit("probe shader failed:\n" + r.stdout[-2000:] + r.stderr[-2000:])
            im = np.asarray(Image.open(png).convert("RGB")).astype(float)[::-1] / 255.0
            for y in range(SIDE):
                for x in range(SIDE):
                    i = base + y * SIDE + x
                    rows.append([rnd(i, k) for k in range(5)] + [im[y, x, 0], im[y, x, 1]])
    finally:
        for p in (frag, png):
            if os.path.exists(p):
                os.remove(p)
    return np.array(rows)


def main():
    a = measure()
    X = [np.ones((len(a), 1))]
    for j, k in enumerate(STAGES):
        n = len(cc.CLASSES[k])
        pos = np.minimum((a[:, j] * n).astype(int), n - 1)
        oh = np.zeros((len(a), n))
        oh[np.arange(len(a)), pos] = 1.0
        X.append(oh)
    X = np.hstack(X)
    reg = LAMBDA * np.eye(X.shape[1])
    reg[0, 0] = 0.0                                          # the intercept is not shrunk
    w = {name: np.linalg.solve(X.T @ X + reg, X.T @ a[:, col]) for name, col in (("mush", 5), ("flat", 6))}
    poor = (a[:, 5] > POOR) | (a[:, 6] > POOR)
    pred = np.maximum(X @ w["mush"], X @ w["flat"])
    flag = pred > 0.5
    head = ["# The flat chain labs' chains as the probe measures them (Tools/chain2d_probe.py; read by EffectShader).",
            "# A ridge fit over %d random chains: predicted mush or flat = intercept + the four stages' class terms;"
            % len(a),
            "# a chain is kept off above 0.5.  %.1f %% of the chains poor (above %.1f), %.1f %% flagged, %.0f %% of"
            % (100 * poor.mean(), POOR, 100 * flag.mean(), 100 * (flag & poor).sum() / max(flag.sum(), 1)),
            "# those poor, %.0f %% of the poor ones flagged.  Rows: knob position mush flat (positions in the energy"
            % (100 * (flag & poor).sum() / max(poor.sum(), 1)),
            "# order); the row 'intercept 0' holds the constant terms."]
    lines = ["intercept\t0\t%.4f\t%.4f" % (w["mush"][0], w["flat"][0])]
    o = 1
    for k in STAGES:
        for p in range(len(cc.CLASSES[k])):
            lines.append("%s\t%d\t%.4f\t%.4f" % (k, p, w["mush"][o], w["flat"][o]))
            o += 1
    io.open(OUT, "w", encoding="utf-8", newline="\n").write("\n".join(head + lines) + "\n")
    print("%d chains, %.1f %% poor, %.1f %% flagged (precision %.2f, recall %.2f) -> %s"
          % (len(a), 100 * poor.mean(), 100 * flag.mean(), (flag & poor).sum() / max(flag.sum(), 1),
             (flag & poor).sum() / max(poor.sum(), 1), OUT))


if __name__ == "__main__":
    main()
