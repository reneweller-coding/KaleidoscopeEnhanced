# -*- coding: utf-8 -*-
"""Write 3D chain scenes (raymarched fields built from composed space folds)."""
import io, os
SP = os.path.dirname(os.path.abspath(__file__))
SPECS = [
 ("Chain3DKifsTetra", "a Sierpinski-tetrahedron fractal: tetrahedral mirror folds, a turning axis and a doubling scale, repeated six times",
  ["p = fScale(p, 0.45, vec3(0.0));", "p = fRepeat(p, vec3(1.3));",
   "for (int i = 0; i < 4; ++i) { p = fTetra(p); p = fRot(p, vec3(1.0, 1.0, 0.0), gRot); p = fScale(p, 2.0, vec3(1.0)); }",
   "gP = p * 0.3;", "return sdBox3(p, vec3(1.1 + 0.3 * gSpread)) / gDR;"]),
 ("Chain3DMandelbox", "a Mandelbox: box folds and sphere folds repeated eight times, its scale breathing slowly",
  ["p = fRepeat(p, vec3(3.0));", "vec3 p0 = p;", "float sc = -1.8 + 0.25 * sin(gRot);",
   "for (int i = 0; i < 8; ++i) { p = fBox(p, 1.0); p = fSphere(p, 0.5, 1.0); p = fScale(p, sc, -p0); gDR += 1.0; }",
   "gP = p0 * 0.6;", "return length(p) / gDR - 0.002;"]),
 ("Chain3DOctaGyroid", "a gyroid membrane folded into octahedral mirror symmetry, the mirrors turning",
  ["p = fRot(p, vec3(0.0, 0.0, 1.0), gRot);", "p = fOcta(p);", "p = fRot(p, vec3(1.0, 0.0, 0.0), 0.4 * sin(gT * 0.05));",
   "gP = p;", "return sdGyroid3(p * 2.5, 0.25 + 0.15 * gSpread) / 2.5;"]),
 ("Chain3DPolarTunnelBoxes", "a tunnel whose wall is a mirrored ring of blocks, repeated along the flight",
  ["vec3 q = fPolarZ(p, 12.0);", "q.x -= 2.2;", "q.z = 0.8 * (abs(mod(q.z / 0.8 - 1.0, 4.0) - 2.0) - 1.0);",
   "q = fRot(q, vec3(0.0, 0.0, 1.0), 0.3 * sin(gRot));", "gP = q * 2.0;",
   "return min(sdBox3(q, vec3(0.35, 0.25 + 0.2 * gSpread, 0.5)), 3.0 - length(p.xy));"]),
 ("Chain3DTwistTorus", "a lattice of tori, twisted slowly along the flight",
  ["vec3 q = fRepeat(p, vec3(1.5));", "q = fTwistZ(q, 0.5 * sin(gT * 0.05));", "q = fRot(q, vec3(1.0, 0.0, 0.0), gRot);",
   "gP = q * 1.5;", "return sdTorus3(q, 0.8, 0.12 + 0.08 * gSpread) * 0.7;"]),
]
TEMPLATE = """//@doc
 * @brief {NAME}: a raymarched world built from a chain of continuous 3D space
 * transforms -- {DESC}.  We fly slowly through it; the surfaces are textured
 * with the photograph read through a 2D transform chain of its own
 * (triplanar), lit and fogged.
 * Every stage is continuous, so the structure morphs without jumps.
 * Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flight (integrated, jump-free)
 *   audioPhase      -> the folds turn (integrated)
 *   audioSpread     -> the bodies thicken
 *   audioKick       -> the rims flare (light)
 *   audioMode       -> the light: cool in minor, warm in major
 *   audioSwell      -> the fog glow and the colour saturation (slow)
 *   audioPhase      -> the surface colours wander (integrated, jump-free)
 *
 * Knobs: styleP (photo surface / glowing rims), speedP (flight speed), detailP (texture sharpness), paletteP (photo colours / a colour field
 * following the 2D chain), hueP.
//@params styleP speedP detailP paletteP
//@audio audioSpread audioKick audioMode audioSwell
//@body
float gT, gSpread, gRot;
float field3(vec3 p)
{{
{CHAIN}
}}
// The surface colouring: a 2D chain of its own, applied triplanarly.
vec2 chain(vec2 uv)
{{
{COL}
    return uv;
}}
// One plane: the photo through the chain, plus a colour field that follows
// the chain's own coordinates (mirrorUV keeps it seamless at the atan cuts).
vec3 chainPlane(vec2 uv, float lod, float pal)
{{
    vec2 c = chain(uv);
    vec3 ph = imgLod(c, lod);
    vec2 m = mirrorUV(c);
    // The colours wander on their own (integrated music phase, jump-free), the
    // mode shifts the palette, the swell saturates it, the kick lights it.
    float h = hueP * 0.159 + 0.9 * m.x + 0.6 * m.y + 0.25 * luma(ph) + 0.12 * audioPhase + 0.004 * sceneTime + 0.3 * clamp(audioMode, 0.0, 1.0);
    float sat = 0.55 + 0.4 * clamp(audioSwell, 0.0, 1.0);
    vec3 fc = hsv2rgb(vec3(fract(h), sat, 1.0)) * (0.35 + 1.3 * luma(ph)) * (1.0 + 0.4 * clamp(audioKick, 0.0, 1.0));
    return mix(ph, fc, pal);
}}
vec3 photoChain3(vec3 q, vec3 n, float lod, float pal)
{{
    vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
    return chainPlane(q.yz * 0.35 + 0.5, lod, pal) * w.x + chainPlane(q.zx * 0.35 + 0.5, lod, pal) * w.y + chainPlane(q.xy * 0.35 + 0.5, lod, pal) * w.z;
}}

void main()
{{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    gT = (0.15 + 0.25 * clamp(speedP, 0.0, 1.0)) * sceneTime + 1.5 * audioAdvance;
    gRot = 0.02 * sceneTime + 0.2 * audioPhase;
    gSpread = clamp(audioSpread, 0.0, 1.0);
    vec3 ro;
    mat3 cf = camFrame(gT, ro);
    gCam = ro;
    vec3 rd = cf * normalize(vec3(p, 1.1));
    float t = 0.05; float d = 1.0; bool hit = false;
    for (int i = 0; i < 100; ++i) {{
        d = fieldD(ro + rd * t);
        if (abs(d) < 0.0008 * t) {{ hit = true; break; }}
        t += d * 0.8;
        if (t > 30.0) break;
    }}
    vec3 lc = mix(vec3(0.7, 0.85, 1.1), vec3(1.15, 0.9, 0.7), mode);
    vec3 fogC = glowColour(imgK(vec2(0.5) + 0.2 * p, 5.0), p, hueP * 0.159) * (0.05 + 0.12 * swell);
    vec3 col = fogC;
    if (hit) {{
        vec3 q = ro + rd * t;
        vec3 n = normal3(q);
        fieldD(q);                                              // sets gP for this point
        vec3 fp = gP;
        float lod = clamp(log2(t * 2.0) + 1.5 * (1.0 - clamp(detailP, 0.0, 1.0)), 0.0, 7.0);
        vec3 tex = photoChain3(fp, n, lod, 0.2 + 0.7 * clamp(paletteP, 0.0, 1.0));
        float tm = luma(tex);
        tex = max((tex - tm) * 1.5 + tm, 0.0) * 1.5;           // livelier colour, brighter
        vec3 L = normalize(vec3(0.5, 0.7, -0.4));
        float diff = max(dot(n, L), 0.0);
        float ao = 0.0;
        for (int k = 1; k <= 4; ++k) {{ float h = 0.04 * float(k); ao += (h - fieldD(q + n * h)) / h; }}
        ao = clamp(1.0 - 0.2 * ao, 0.2, 1.0);
        float fres = pow(1.0 - abs(dot(n, -rd)), 3.0);
        vec3 surf = tex * lc * (0.35 + 0.9 * diff) * ao;
        vec3 rimC = glowColour(tex, fp.xy, hueP * 0.159);
        vec3 rim = rimC * fres * (0.4 + 1.5 * kick) + surf * 0.15;
        float st = clamp(styleP, 0.0, 1.0);
        vec3 sc = mix(surf + rimC * fres * (0.15 + 0.6 * kick), rim * 1.3 + rimC * 0.05 * ao, smoothstep(0.5, 1.0, st));
        col = mix(fogC, sc, exp(-t * (0.06 + 0.04 * swell)));
    }}
    finish(col);
}}
"""
COLS = {'Chain3DSphereFoldLattice': ['uv = tWave(uv, 6.0, 0.05, gT * 0.5);', 'uv = tP4m(uv, 3.0);', 'uv = tSpiral(uv, vec2(0.5), 4.0, 1.0, gT * 0.3);'], 'Chain3DKifsTetra': ['uv = tSpiral(uv, vec2(0.5), 4.0, 1.0, gT * 0.3);', 'uv = mirrorUV(uv);', 'uv = tKaleido(uv, vec2(0.5), 6.0, gRot);'], 'Chain3DMandelbox': ['uv = tKaleido(uv, vec2(0.5), 6.0, gRot);', 'uv = mirrorUV(uv);', 'uv = tSpiral(uv, vec2(0.5), 3.0, 1.0, gT * 0.2);'], 'Chain3DOctaGyroid': ['uv = tMobius(uv, vec2(0.3, 0.5), vec2(0.7, 0.5), 0.35);', 'uv = mirrorUV(uv);', 'uv = tFold(uv, 0.4 + 0.3 * sin(gT * 0.1), 1.25, 3.0);'], 'Chain3DPolarTunnelBoxes': ['uv = tKaleido(uv, vec2(0.5), 8.0, gRot);', 'uv = mirrorUV(uv);', 'uv = tDroste(uv, vec2(0.5), 3.0, gT * 0.2);'], 'Chain3DTwistTorus': ['uv = tExp(uv, vec2(0.5), 4.0);', 'uv = mirrorUV(uv);', 'uv = tKaleido(uv, vec2(0.5), 6.0, gRot);'], 'Chain3DOctaKifs': ['uv = tWave(uv, 6.0, 0.05, gT * 0.5);', 'uv = tP4m(uv, 3.0);', 'uv = tSpiral(uv, vec2(0.5), 4.0, 1.0, gT * 0.3);']}
for name, desc, lines in SPECS:
    body = "\n".join("    " + l for l in lines)
    cbody = "\n".join("    " + l for l in COLS[name])
    io.open(os.path.join(SP, "src", name + ".glsl"), "w", encoding="utf-8").write(
        TEMPLATE.format(NAME=name.upper(), DESC=desc, CHAIN=body, COL=cbody))
    print(name)
