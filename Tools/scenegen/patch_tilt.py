"""Time tilt (tiltP) for the 2D chain labs: a cut through the chain's space-time volume.

A 2D chain whose parameters run with time is a volume (x, y, t); every lab so
far showed one moment of it, t = const.  tiltP tilts the cut: the chain's
time t0 + a x + b y, so every place of the picture shows another moment, the
tilt's direction turning slowly (clock only) and its strength following the
slow swell.  Same cost as before; in the chain runner every pass applies the
same per-pixel shift.  ChainLab2D (and FxChain, built from it) apply it in
chain(); the tunnel on its wall coordinate (the baked square in the runner).
"""
import io, os, re
SG = os.path.dirname(os.path.abspath(__file__))

TILT = r'''// The time tilt (tiltP): the chain's own time t0 + a x + b y across the
// picture -- a cut through its space-time volume (x, y, t), so every place
// shows another moment of the chain.  Its direction turns slowly (clock only),
// its strength follows the slow swell.  0 below tiltP 0.15.  The uniform lives
// here (not in the labs' knob lists) so every lab built on these stages compiles.
uniform float tiltP;
float chainTiltZ(vec2 q)
{
    float k = smoothstep(0.15, 1.0, tiltP) * 0.6 * (0.55 + 0.45 * clamp(audioSwell, 0.0, 1.0));
    float a = 0.011 * sceneTime;
    return k * dot(vec2(cos(a), sin(a)), q);
}
'''

def patch(path, old, new, count=1):
    s = io.open(path, encoding="utf-8", newline="").read()
    nl = "\r\n" if "\r\n" in s else "\n"
    old_n, new_n = old.replace("\n", nl), new.replace("\n", nl)
    if new_n in s:
        print("already", os.path.basename(path)); return
    assert s.count(old_n) == count, (path, old)
    io.open(path, "w", encoding="utf-8", newline="").write(s.replace(old_n, new_n))
    print("patched", os.path.basename(path))

# ChainLab2D: the tilt in chain() (FxChain is built from this file)
patch(os.path.join(SG, "src", "ChainLab2D.glsl"),
"""vec2 chain(vec2 p)
{
    return runChain(p * 0.5 + 0.5);
}""",
TILT + """vec2 chain(vec2 p)
{
    float tz = chainTiltZ(p);
    float t0 = gT, r0 = gRot;
    gT += tz; gRot += 0.5 * tz;
    vec2 c = runChain(p * 0.5 + 0.5);
    gT = t0; gRot = r0;
    return c;
}""")

# the tunnel: on its wall coordinate (what the runner bakes over [0,1]^2)
patch(os.path.join(SG, "make_chainlabtunnel.py"),
"""    gIdW = 1.0;
    uv = stageA(uv); uv = mirrorUV(uv);""",
"""    gIdW = 1.0;
    float tz = chainTiltZ(uv * 2.0 - 1.0);              // the time tilt on the wall (tiltP)
    float t0 = gT, r0 = gRot;
    gT += tz; gRot += 0.5 * tz;
    uv = stageA(uv); uv = mirrorUV(uv);""")
patch(os.path.join(SG, "make_chainlabtunnel.py"),
"""    if (gIdW > 0.0) uv = morphMix(uv, tKaleido(mirrorUV(uv), gCw, 6.0, gRot), gIdW);
    return uv;""",
"""    if (gIdW > 0.0) uv = morphMix(uv, tKaleido(mirrorUV(uv), gCw, 6.0, gRot), gIdW);
    gT = t0; gRot = r0;
    return uv;""")

# the passes: every pass shifts its time by the same per-pixel amount (not with a start pass:
# the 3D labs bring their own time per pixel)
patch(os.path.join(SG, "make_chainpass.py"),
'''    PRE = """    gT = (0.03 + 0.06 * clamp(speedP, 0.0, 1.0)) * sceneTime + 0.25 * audioAdvance;
    gSpread = clamp(audioSpread, 0.0, 1.0);
    gRot = 0.02 * sceneTime + 0.2 * audioPhase;
    gCw = vec2(0.5) + 0.15 * vec2(sin(0.017 * sceneTime), cos(0.013 * sceneTime));
    gCt = vec2(0.5) + vec2(0.22 * sin(0.023 * sceneTime + 0.3 * sin(0.011 * sceneTime)), 0.16 * cos(0.019 * sceneTime));
"""''',
'''    PRE = """    gT = (0.03 + 0.06 * clamp(speedP, 0.0, 1.0)) * sceneTime + 0.25 * audioAdvance;
    gSpread = clamp(audioSpread, 0.0, 1.0);
    gRot = 0.02 * sceneTime + 0.2 * audioPhase;
    gCw = vec2(0.5) + 0.15 * vec2(sin(0.017 * sceneTime), cos(0.013 * sceneTime));
    gCt = vec2(0.5) + vec2(0.22 * sin(0.023 * sceneTime + 0.3 * sin(0.011 * sceneTime)), 0.16 * cos(0.019 * sceneTime));
    if (useStart == 0 && tiltP > 0.0) {       // the time tilt (chainTiltZ): the same shift in every pass of this pixel
        vec2 sp0 = ((gl_FragCoord.xy + chainOff) / resolution - 0.5) * vec2(resolution.x / resolution.y, 1.0);
        float tz = chainTiltZ(bakeSize > 0.0 ? gl_FragCoord.xy / bakeSize * 2.0 - 1.0 : sp0);
        gT += tz; gRot += 0.5 * tz;
    }
"""''')
