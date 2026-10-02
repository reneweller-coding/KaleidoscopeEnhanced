"""Music in the chain's structure: the warp stage (D) breathes with the slow swell.

A quiet passage shows the flows, waves and vortices of stage D at 55 %, a full
one at 100 % -- a partial warp, uv + s * displacement, continuous at any s.
Not the sub-variants (many classes make arm or lattice counts of them: a jump)
and not the rotating classes (turning, twirl): no rotation on the music.
Uber shaders: stageDs() around stageDk(); the chain runner: the D passes.
"""
import io, os
SG = os.path.dirname(os.path.abspath(__file__))
NO_BREATH = (0, 1, 5)        # stage D branches: none, twirl, turning

STAGEDS = r'''// Music in the structure: the warp stage breathes with the slow swell -- 55 %
// of its displacement in a quiet passage, all of it at full swell (a partial
// warp: continuous at any strength).  Not for none, twirl and turning: no
// rotation on the music.
vec2 stageDs(vec2 uv, int k, float v)
{
    vec2 r = stageDk(uv, k, v);
    int b = ordd(k);
    if (b == 0 || b == 1 || b == 5) return r;
    return morphMix(uv, r, 0.55 + 0.45 * clamp(audioSwell, 0.0, 1.0));
}
'''

def patch(path, pairs):
    raw = open(path, "rb").read()
    crlf = raw.count(b"\r\n") > raw.count(b"\n") // 2
    s = raw.decode("utf-8").replace("\r\n", "\n")
    for old, new in pairs:
        if new in s:
            continue
        assert s.count(old) == 1, (path, s.count(old), old)
        s = s.replace(old, new)
    if crlf: s = s.replace("\n", "\r\n")
    open(path, "wb").write(s.encode("utf-8"))
    print("patched", os.path.basename(path))

patch(os.path.join(SG, "src", "ChainLab2D.glsl"), [
    ("vec2 stageD(vec2 uv)\n{", STAGEDS + "vec2 stageD(vec2 uv)\n{"),
    ("    vec2 r = stageDk(uv, ka, va);\n    if (f > 0.0) r = morphMix(r, stageDk(uv, kb, vb), f);",
     "    vec2 r = stageDs(uv, ka, va);\n    if (f > 0.0) r = morphMix(r, stageDs(uv, kb, vb), f);"),
])
patch(os.path.join(SG, "make_chainpass.py"), [
    ('''            io.open(os.path.join(OUT, "%s%d.frag" % (st, br)), "w", encoding="utf-8", newline="\\n").write(
                shader(code, "", std_main, title))''',
     '''            main_body = std_main
            if st == "D" and br not in (0, 1, 5):     # the warp breathes with the swell (stageDs)
                main_body = std_main.replace("fragColor = vec4(cls(uv, subV), 0.0, 1.0);",
                                             "fragColor = vec4(morphMix(uv, cls(uv, subV), 0.55 + 0.45 * clamp(audioSwell, 0.0, 1.0)), 0.0, 1.0);")
                assert main_body != std_main
            io.open(os.path.join(OUT, "%s%d.frag" % (st, br)), "w", encoding="utf-8", newline="\\n").write(
                shader(code, "", main_body, title))'''),
])
