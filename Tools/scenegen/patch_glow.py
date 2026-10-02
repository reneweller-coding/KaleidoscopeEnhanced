"""Afterglow (glowP) for the chain labs: the last frame as a fading phosphor veil.

The engine binds the last fully composited frame on unit 34 (texPrevFrame).
A lab with glowP above 0.15 shows max(new, decayed previous): slow chains
leave soft trails, a fast change a short shimmer.  The function sits beside
the time tilt in ChainLab2D.glsl's stage part, which the tunnel and the 3D
labs take along; each lab calls it right before finish().
"""
import io, os
SG = os.path.dirname(os.path.abspath(__file__))

GLOW = r'''// Afterglow (glowP): the last frame's picture as a fading phosphor veil -- the
// new frame is never darker than a decayed copy of the previous one, so slow
// chains leave soft trails and a fast change a short shimmer.  Off below 0.15;
// the decay stays below 0.8 so the composited frame (exposure, bloom) cannot
// feed itself up.
uniform float glowP;
uniform sampler2D texPrevFrame;   // the last frame, fully composited (unit 34)
vec3 chainAfterglow(vec3 col)
{
    if (glowP <= 0.15) return col;
    vec3 prev = texture(texPrevFrame, gl_FragCoord.xy / resolution).rgb;
    return max(col, prev * (0.78 * smoothstep(0.15, 1.0, glowP)));
}
'''

def patch(path, old, new, count=1):
    raw = open(path, "rb").read()
    crlf = raw.count(b"\r\n") > raw.count(b"\n") // 2
    s = raw.decode("utf-8").replace("\r\n", "\n")
    if new in s:
        print("already", os.path.basename(path)); return
    assert s.count(old) == count, (path, s.count(old), old)
    s = s.replace(old, new)
    if crlf: s = s.replace("\n", "\r\n")
    open(path, "wb").write(s.encode("utf-8"))
    print("patched", os.path.basename(path))

# the function, before chain() of the 2D lab (after the tilt: the tunnel takes that whole stretch)
patch(os.path.join(SG, "src", "ChainLab2D.glsl"),
"""vec2 chain(vec2 p)
{
    float tz = chainTiltZ(p);""",
GLOW + """vec2 chain(vec2 p)
{
    float tz = chainTiltZ(p);""")
# the calls
patch(os.path.join(SG, "src", "ChainLab2D.glsl"),
"""    col += gc * edge * kick * 0.55 * ((s0 <= 1 ? 1.0 - sf : 0.0) + (s1 <= 1 ? sf : 0.0));   // kick glints on photo/relief (light only)
    finish(col);""",
"""    col += gc * edge * kick * 0.55 * ((s0 <= 1 ? 1.0 - sf : 0.0) + (s1 <= 1 ? sf : 0.0));   // kick glints on photo/relief (light only)
    finish(chainAfterglow(col));""")
patch(os.path.join(SG, "make_chainlabtunnel.py"), "    finish(col);", "    finish(chainAfterglow(col));")
patch(os.path.join(SG, "make_chainlab3d.py"),
"""MAIN = MAIN.replace("void main()", RELIEF + "\\nvoid main()", 1)""",
"""MAIN = MAIN.replace("void main()", RELIEF + "\\nvoid main()", 1)
assert MAIN.rstrip().endswith("finish(col);\\n}") or MAIN.rstrip().endswith("finish(col);\\r\\n}")
MAIN = MAIN[:MAIN.rindex("finish(col);")] + "finish(chainAfterglow(col));" + MAIN[MAIN.rindex("finish(col);") + len("finish(col);"):]""")
