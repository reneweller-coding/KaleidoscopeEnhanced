# -*- coding: utf-8 -*-
"""One-off patch (30.09.): ChainLab2D's single-stage morph becomes the chain walk
(every stage may walk, random targets with fresh sub-variants), and the style
walks too.  Kept in the repo as a record of how the source was changed."""
import io, os
SP = os.path.dirname(os.path.abspath(__file__))
f = os.path.join(SP, "src", "ChainLab2D.glsl")
s = io.open(f, encoding="utf-8").read()

# ---- 1. the walk replaces the single-stage morph ---------------------------
a = s.index("// Chain morph: morphP picks")
b = s.index("vec2 chain(vec2 p)")
walk = r'''// Chain walk.  morphP is rolled once per start:
//   below 0.15  the chain stays as rolled;
//   0.15..0.5   one stage (A, B, C or D) walks on;
//   from 0.5    EVERY stage walks, and the style with them -- one lab scene
//               can play for hours without ever repeating.
// A walking stage holds a transform, then cross-fades to another one picked by
// hash, with a fresh sub-variant (mirrors, arms, {p,q} ...), so it roams its
// whole class instead of cycling.  In the all-stages walk the four stages are
// staggered by a quarter, so mostly one fades at a time.  The fade mixes the
// two MIRRORED outputs, each continuous: the picture never jumps.  Driven by
// time and the integrated music (sceneAdvance surges on flux and harmonic
// changes).
bool walkAll() { return clamp(morphP, 0.0, 1.0) >= 0.5; }
bool walks(int stage)
{
    float m = clamp(morphP, 0.0, 1.0);
    if (m < 0.15) return false;
    if (m >= 0.5) return true;
    return int(min(floor((m - 0.15) / 0.35 * 4.0), 3.0)) + 1 == stage;
}
// The transform (k) and sub-variant (v) shown in walk cycle c; cycle 0 is the rolled one.
void walkPick(float c, int k0, float v0, int n, float salt, out int k, out float v)
{
    if (c < 0.5) { k = k0; v = v0; return; }
    float s = salt + 17.0 * (chainAP + 2.0 * chainBP + 3.0 * chainCP + 5.0 * chainDP);   // each start walks its own way
    k = int(min(floor(hash11(c * 7.31 + s) * float(n)), float(n - 1)));
    v = hash11(c * 3.17 + s * 1.7 + 0.5);
}
float walkPos(int stage) { return walkAll() ? 0.5 * gMw + 0.25 * float(stage - 1) : gMw; }
float walkFade(float kf) { return smoothstep(walkAll() ? 0.7 : 0.55, 1.0, fract(kf)); }
vec2 morphMix(vec2 a, vec2 b, float f) { return mix(mirrorUV(a), mirrorUV(b), f); }
'''
for X, IDX, KNOB, N, SALT in [("A", 1, "chainAP", 11, "1.3"), ("B", 2, "chainBP", 6, "2.9"),
                              ("C", 3, "chainCP", 8, "4.7"), ("D", 4, "chainDP", 6, "6.1")]:
    walk += (
        "vec2 stage%(X)s(vec2 uv)\n{\n"
        "    int k0 = pickStage(%(K)s, %(N)d); float v0 = subVar(%(K)s, %(N)d);\n"
        "    if (!walks(%(I)d)) return stage%(X)sk(uv, k0, v0);\n"
        "    float kf = walkPos(%(I)d), c = floor(kf);\n"
        "    int i0, i1; float w0, w1;\n"
        "    walkPick(c, k0, v0, %(N)d, %(S)s, i0, w0);\n"
        "    walkPick(c + 1.0, k0, v0, %(N)d, %(S)s, i1, w1);\n"
        "    float f = walkFade(kf);\n"
        "    if (f <= 0.0) return stage%(X)sk(uv, i0, w0);\n"
        "    return morphMix(stage%(X)sk(uv, i0, w0), stage%(X)sk(uv, i1, w1), f);\n}\n"
        % dict(X=X, K=KNOB, N=N, I=IDX, S=SALT))
s = s[:a] + walk + s[b:]

# ---- 2. the style walks too ------------------------------------------------
a = s.index("    // The rolled style snaps to a pure look")
b = s.index("    col *= mix(vec3(0.9, 0.97, 1.08), vec3(1.08, 0.98, 0.9), mode);")
style = r'''    // The look: the rolled one (a pure look -- blends between neighbouring looks
    // are muddy); in the all-stages walk the look walks too, slowly, each look
    // computed on its own and cross-faded.  s0/s1/sf depend on knobs and time
    // only, so every pixel takes the same branches.
    int s0, s1; float sf = 0.0, dummy;
    s0 = pickStage(styleP, 5); s1 = s0;
    if (walkAll()) {
        float kf = 0.2 * gMw + 0.6, c = floor(kf);
        walkPick(c, s0, 0.0, 5, 23.0, s0, dummy);
        walkPick(c + 1.0, pickStage(styleP, 5), 0.0, 5, 23.0, s1, dummy);
        sf = smoothstep(0.7, 1.0, fract(kf));
    }
    // Flow: noise living in the chain's own space, smeared along the chain's
    // contour direction (line integral convolution) with a travelling phase --
    // silky stream lines that follow the chain.  Only paid for while shown.
    vec3 flowC = photo * 0.25;
    if (s0 == 4 || (s1 == 4 && sf > 0.0)) {
        vec2 fd = vec2(-grad.y, grad.x);
        float gl = length(fd);
        fd /= max(gl, 1e-5);
        float hpx = 3.0 / resolution.y;
        float ph = gT * 25.0;
        float acc = 0.0, wsum = 0.0;
        for (int k = -6; k <= 6; ++k) {
            float fk = float(k);
            float nz = noise2(mirrorUV(chain(p + fd * fk * hpx)) * 70.0);
            float w = 1.0 + 0.8 * sin(fk * 0.7 - ph);
            acc += nz * w; wsum += w;
        }
        float lic = smoothstep(0.38, 0.72, acc / wsum) * smoothstep(0.004, 0.04, gl);
        flowC = gc * lic * (1.3 + kick) + photo * 0.25;
    }
    vec3 looks[5] = vec3[5](photo, reliefC, neon, isoC, flowC);
    vec3 col = mix(looks[s0], looks[s1], sf);
'''
s = s[:a] + style + s[b:]
old = "    col += gc * edge * kick * 0.3 * (1.0 - smoothstep(1.0, 2.0, st));\n"
assert old in s
s = s.replace(old, "    col += gc * edge * kick * 0.3 * ((s0 <= 1 ? 1.0 - sf : 0.0) + (s1 <= 1 ? sf : 0.0));   // kick glints on photo/relief\n")
s = s.replace(" * runs), morphP (which stage, if any, morphs on through its class while the\n * scene runs -- driven by the music, always as a cross-fade), styleP",
              " * runs), morphP (the chain walk: none, one stage, or every stage and the\n * look -- driven by the music, always as a cross-fade), styleP")
io.open(f, "w", encoding="utf-8", newline="\n").write(s)
print("ok")
