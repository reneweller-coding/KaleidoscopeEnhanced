# -*- coding: utf-8 -*-
"""One-off patch (30.09.): the ORDER of the four stages becomes a knob (orderP,
one of 24 permutations; index 0 = A, B, C, D) and a ninth walk stage (the app
cross-fades two whole chains of different order -- there is no 'half swapped')."""
import io, os, re, itertools
SP = os.path.dirname(os.path.abspath(__file__))
R = os.path.abspath(os.path.join(SP, "..", "..", "Source")) + os.sep

perms = list(itertools.permutations(range(4)))
codes = [sum(p[i] << (2 * i) for i in range(4)) for p in perms]
permfn = "int permCode(int i) { %s return %d; }" % (" ".join("if (i == %d) return %d;" % (k, c) for k, c in enumerate(codes[:-1])), codes[-1])
RUN = '''// Stage order: the four stages are not commutative (a spiral seen through a
// kaleidoscope is not a kaleidoscope wound into a spiral).  orderP picks one of
// the 24 orders (0 = A, B, C, D); the app may walk it too: then two whole
// chains of different order are cross-faded (walkO: shown, target, fade).
''' + permfn + '''   // base-4 digits: the stage at each position
uniform vec3 walkO;
vec2 applyStage(int k, vec2 uv) { return k == 0 ? stageA(uv) : k == 1 ? stageB(uv) : k == 2 ? stageC(uv) : stageD(uv); }
vec2 runOrder(vec2 uv, int code)
{
    for (int pos = 0; pos < 4; ++pos) {
        uv = applyStage((code >> (2 * pos)) & 3, uv);
        if (pos < 3) uv = mirrorUV(uv);
    }
    return uv;
}
vec2 runChain(vec2 uv)
{
    int o0 = pickStage(orderP, 24), o1 = o0;
    float f = 0.0;
    if (walkHost > 0.5 && walkAll()) { o0 = pickStage(walkO.x, 24); o1 = pickStage(walkO.y, 24); f = smoothstep(0.0, 1.0, walkO.z); }
    gIdW = 1.0;
    vec2 a = runOrder(uv, permCode(o0));
    if (f > 0.0 && o1 != o0) {
        float gi = gIdW;
        gIdW = 1.0;
        vec2 b = runOrder(uv, permCode(o1));
        gIdW = mix(gi, gIdW, f);
        a = morphMix(a, b, f);
    }
    // Never an empty chain: as the stages together approach 'none' -- or only
    // weak classes that leave the photo nearly bare (gIdW) -- a calm six-fold
    // kaleidoscope fades in -- the bare photo is never shown.
    if (gIdW > 0.0) a = morphMix(a, tKaleido(mirrorUV(a), gCw, 6.0, gRot), gIdW);
    return a;
}
'''
p = os.path.join(SP, "src", "ChainLab2D.glsl")
s = io.open(p, encoding="utf-8").read()
i = s.index("vec2 chain(vec2 p)\n{")
j = s.index("\n}\n", i) + 3
s = s[:i] + RUN + "vec2 chain(vec2 p)\n{\n    return runChain(p * 0.5 + 0.5);\n}\n" + s[j:]
s = s.replace("//@params chainAP chainBP chainCP chainDP morphP styleP", "//@params chainAP chainBP chainCP chainDP orderP morphP styleP")
s = s.replace(" * runs), morphP (the chain walk:", " * runs), orderP (the order of the four stages: one of 24), morphP (the chain walk:")
io.open(p, "w", encoding="utf-8", newline="\n").write(s)

for fn, knobs_old, knobs_new in [("make_chainlab3d.py", "chainAP chainBP chainCP chainDP morphP", "chainAP chainBP chainCP chainDP orderP morphP"),
                                 ("make_chainlabtunnel.py", "chainAP chainBP chainCP chainDP morphP", "chainAP chainBP chainCP chainDP orderP morphP")]:
    q = os.path.join(SP, fn)
    t = io.open(q, encoding="utf-8").read()
    assert knobs_old in t
    t = t.replace(knobs_old, knobs_new, 1)
    i = t.index("vec2 chain(vec2 uv)\n{")
    j = t.index("\n}\n", i) + 3
    t = t[:i] + "vec2 chain(vec2 uv)\n{\n    return runChain(uv);\n}\n" + t[j:]
    io.open(q, "w", encoding="utf-8", newline="\n").write(t)

# the app walks the order as a ninth stage
def patch(fn, pairs):
    b = open(R + fn, "rb").read().decode("utf-8")
    crlf = "\r\n" in b
    s = b.replace("\r\n", "\n")
    for old, new in pairs:
        assert s.count(old) == 1, (fn, old[:60])
        s = s.replace(old, new)
    if crlf:
        s = s.replace("\n", "\r\n")
    open(R + fn, "wb").write(s.encode("utf-8"))
    print(fn, "ok")
H = []
for a in ["x0", "x1", "f", "fadeDur", "hold"]:
    H.append(("		float %s[8] = {};" % a, "		float %s[9] = {};" % a))
H += [("		bool  fading[8] = {};", "		bool  fading[9] = {};"),
      ("std::map<int, std::array<float, 8>> sectionLook;", "std::map<int, std::array<float, 9>> sectionLook;"),
      ("GLint	m_walkLoc[8] = { -1, -1, -1, -1, -1, -1, -1, -1 };", "GLint	m_walkLoc[9] = { -1, -1, -1, -1, -1, -1, -1, -1, -1 };")]
patch("EffectShader.h", H)
patch("EffectShader.cpp", [
    ("static const int   kWalkN = 8;", "static const int   kWalkN = 9;            // + the stage order (8)"),
    ('static const char *kWalkKnob[8]  = { "chainAP", "chainBP", "chainCP", "chainDP", "styleP", "spaceP", "coreP", "bodyP" };',
     'static const char *kWalkKnob[9]  = { "chainAP", "chainBP", "chainCP", "chainDP", "styleP", "spaceP", "coreP", "bodyP", "orderP" };'),
    ('static const char *kWalkUni[8]   = { "walkA", "walkB", "walkC", "walkD", "walkS", "walkSpace", "walkCore", "walkBody" };',
     'static const char *kWalkUni[9]   = { "walkA", "walkB", "walkC", "walkD", "walkS", "walkSpace", "walkCore", "walkBody", "walkO" };'),
    ('static const char *kWalkName[8]  = { "A", "B", "C", "D", "look", "space", "core", "body" };',
     'static const char *kWalkName[9]  = { "A", "B", "C", "D", "look", "space", "core", "body", "order" };'),
    ("static bool isStructure( int s ) { return s >= 5; }", "static bool isStructure( int s ) { return s >= 5 && s <= 7; }"),
    ("		for( int o = 5; o < kWalkN; ++o )", "		for( int o = 5; o <= 7; ++o )"),
    ("			std::array<float, 8> look;", "			std::array<float, 9> look;"),
])
print("ok")
