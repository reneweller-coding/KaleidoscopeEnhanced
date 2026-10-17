"""Which of the 3D chain lab's worlds look poor from its camera -> Engine/chain3d_worlds.tsv (read by the app).

The lab rolls a world from three stages -- space (20 classes), fold core (22) and body (22), 9680 combinations.  Many
of them showed mostly haze (the world nearly empty round the flight) or a fine-grained carpet (a surface turning
at pixel scale everywhere: the fold cores that iterate the bodies down to dust).  For every combination this probe
casts rays like the lab's camera does: from twelve positions along 450 units of the flight path (every other one
looking as from a side window, the tube carved only near the camera; the worlds rolled round the flight axis change
along it), 8 directions each in the gazes' cone (yaw +-0.95, pitch +-0.6), each with a neighbour
5 pixels away, marched through the lab's own world (Scene2D/ChainLab3D.frag's fieldK, the world at half size, the
tube, the thinning, the near carve) exactly as the lab marches.  Per world:

  miss   share of rays that hit nothing within 30 -- the haze
  bump   share of neighbour pairs on one surface whose normals differ by more than 37 degrees -- the carpet
  dark   the largest miss share of one camera position -- a stretch of the flight in nothing but haze (the worlds
         rolled round the flight axis march to a standstill where the path comes near the axis)

poorness = max(miss, bump, dark - 0.25).  Against 48 rolls looked at by eye (17.10.2026: 19 poor, 16 good) the
line 0.4 caught 16 of the poor ones and moved 4 good ones (0.5: 12 and 2) -- 57 % of the worlds lie above it.
EffectShader keeps the lab off them (WorldLine 0.4) when it rolls one -- preferring a replacement clearly below
(WorldClear 0.3) -- or walks to one (KALEIDO_NO_WORLD_FILTER switches that off).

The whole probe is one PresetEditor --render (a 22 x 440 frame, every pixel a world; the editor's
command-line render shows no window on the screen and takes no focus).  Positions are the energy order of the classes
(the shader's pickStage), as the app's classPos().

    python Tools/chain3d_world_probe.py          (after changing ChainLab3D's world, camera or march)
"""
import io
import os
import subprocess
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "Engine", "chain3d_worlds.tsv")
NS, NC, NB = 20, 22, 22
POOR = 0.4

PROBE = r"""
float gXs, gXc, gXb;
// The lab's fieldD with the world's classes as arguments (fieldK) instead of the knobs.
float probeD(vec3 p)
{
    gDR = 1.0;
    float d = fieldK(p * gWorldK, gXs, gXc, gXb, 0) / gWorldK;
    float r = length(p.xy - camPathXY(p.z));
    float thin = gThin * (1.0 - smoothstep(0.0, 1.4, r));
    if (gSide > 0.0) thin *= 1.0 - gSide * smoothstep(3.0, 6.0, abs(p.z - gCam.z));
    d += thin;
    float tube = max(gTube - r, -1.0);
    if (gSide > 0.0) tube = mix(tube, -1.0, gSide * smoothstep(3.0, 6.0, abs(p.z - gCam.z)));
    return max(smaxK(d, 0.8 * tube, 0.15), 0.3 - length(p - gCam));
}
vec3 probeN(vec3 p)
{
    const vec2 e = vec2(0.0015, -0.0015);
    return normalize(e.xyy * probeD(p + e.xyy) + e.yyx * probeD(p + e.yyx) + e.yxy * probeD(p + e.yxy) + e.xxx * probeD(p + e.xxx));
}
float march(vec3 ro, vec3 rd)
{
    float t = 0.05;
    for (int i = 0; i < 100; ++i) {
        float d = probeD(ro + rd * t);
        if (abs(d) < 0.0015 * t) return t;
        t += d * 0.8;
        if (t > 30.0) break;
    }
    return -1.0;
}
void main()
{
    ivec2 ip = ivec2(gl_FragCoord.xy);
    int ci = ip.x, si = ip.y / 22, bi = ip.y - si * 22;
    if (ci >= 22 || si >= 20) { fragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
    gXs = (float(si) + 0.5) / 20.0; gXc = (float(ci) + 0.5) / 22.0; gXb = (float(bi) + 0.5) / 22.0;
    gT = 10.0; gRot = 0.3; gSpread = 0.4; gMw = 0.0;
    gWorldK = 2.0; gPathAmp = 1.0 / gWorldK; gThin = 0.25; gTube = 0.45;   // as the lab's main sets them
    int nRay = 0, nMiss = 0, nSmooth = 0, nBump = 0;
    float dark = 0.0;
    for (int c = 0; c < 12; ++c) {
        vec3 ro;
        mat3 cf = camFrame(37.0 + 41.3 * float(c), ro);
        gCam = ro;
        gSide = (c % 2 == 1) ? 1.0 : 0.0;
        int cMiss = 0;
        for (int k = 0; k < 8; ++k) {
            vec2 h = hash22(vec2(float(k) * 1.37 + float(c) * 7.1, float(k) * 0.71 + 3.3));
            vec2 a = vec2((h.x * 2.0 - 1.0) * 0.95, (h.y * 2.0 - 1.0) * 0.6);
            vec3 v = normalize(vec3(sin(a.x) * cos(a.y), sin(a.y), cos(a.x) * cos(a.y)));
            vec3 v2 = normalize(v + vec3(0.004, 0.0, 0.0));
            float t1 = march(ro, cf * v), t2 = march(ro, cf * v2);
            ++nRay;
            if (t1 < 0.0) { ++nMiss; ++cMiss; }
            if (t1 > 0.0 && t2 > 0.0 && abs(t1 - t2) <= 0.25 * min(t1, t2)) {
                ++nSmooth;
                if (dot(probeN(ro + cf * v * t1), probeN(ro + cf * v2 * t2)) < 0.8) ++nBump;
            }
        }
        dark = max(dark, float(cMiss) / 8.0);
    }
    fragColor = vec4(float(nMiss) / float(nRay), float(nBump) / max(float(nSmooth), 1.0), dark, 1.0);
}
"""


def main():
    lab = io.open(os.path.join(ROOT, "Scene2D", "ChainLab3D.frag"), encoding="utf-8").read()
    frag = os.path.join(ROOT, "_world_probe.frag")
    io.open(frag, "w", encoding="utf-8", newline="\n").write(lab[:lab.rindex("void main()")] + PROBE)
    png = os.path.join(ROOT, "_world_probe.png")
    try:
        r = subprocess.run([os.path.join(ROOT, "PresetEditor", "build", "Release", "PresetEditor.exe"), "--render",
                            "_world_probe.frag", "CombinePlain.frag", png, "22", "440", "--time", "10"],
                           cwd=os.path.join(ROOT, "Release"), capture_output=True, text=True, timeout=600)
        if "OK" not in r.stdout + r.stderr:
            sys.exit("probe shader failed:\n" + r.stdout[-2000:] + r.stderr[-2000:])
        im = np.asarray(Image.open(png).convert("RGB")).astype(float)[::-1] / 255.0   # gl_FragCoord.y from the bottom
    finally:
        for f in (frag, png):
            if os.path.exists(f):
                os.remove(f)
    rows, poor = [], 0
    for si in range(NS):
        for ci in range(NC):
            for bi in range(NB):
                miss, bump, dark = im[si * NB + bi, ci]
                p = max(miss, bump, dark - 0.25)
                poor += p > POOR
                rows.append("%d\t%d\t%d\t%.3f\t%.3f\t%.3f\t%.3f" % (si, ci, bi, p, miss, bump, dark))
    head = ["# The 3D chain lab's worlds as its camera sees them (Tools/chain3d_world_probe.py; read by EffectShader).",
            "# space core body (positions in the energy order), poorness = max(miss, bump, dark - 0.25) (poor above %.2f),"
            % POOR,
            "# miss (share of rays into the haze), bump (share of neighbour pixels whose surface turns more than 37",
            "# degrees), dark (the largest miss share of one camera position)."]
    io.open(OUT, "w", encoding="utf-8", newline="\n").write("\n".join(head + rows) + "\n")
    print("%d worlds, %d poor (%.0f %%) -> %s" % (len(rows), poor, 100.0 * poor / len(rows), OUT))


if __name__ == "__main__":
    main()
