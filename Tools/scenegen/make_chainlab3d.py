# -*- coding: utf-8 -*-
"""Build src/ChainLab3D.glsl: rolled 3D fold chains, coloured by the 2D lab's stage machine."""
import io, os, re
SP = os.path.dirname(os.path.abspath(__file__))
lab2 = io.open(os.path.join(SP, "src", "ChainLab2D.glsl"), encoding="utf-8").read()
a = lab2.index("// The stage index and a sub-variant")
b = lab2.index("vec2 chain(vec2 p)")
STAGES = re.sub(r"\bgT\b", "gTC", lab2[a:b])      # the colour chain flows at the 2D lab's calm pace
HEAD = r'''//@doc
 * @brief CHAIN LAB 3D: the 3D chain laboratory -- every start rolls a new
 * raymarched world from three classes of continuous space transforms: a space
 * (mirrored lattice, polar ring tunnel, twisted lattice, octahedral lattice,
 * turning lattice), a fold core (none, tetrahedral KIFS, octahedral KIFS, a
 * sphere-inversion box fold, plane folds, Menger sponge) and an end body (block, ball, torus, gyroid
 * membrane, cross).  The surfaces are coloured by a rolled 2D chain of the
 * 2D chain lab (global map, symmetry, second map, warp) projected
 * triplanarly, with a colour field that follows the chain and wanders with the
 * music.  The camera flies a winding path through a soft tube carved out of
 * every body, so it never collides.  Endless.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flight and the flow through the colour chain (integrated, jump-free)
 *   audioPhase      -> the folds turn, the colours wander (integrated)
 *   audioSpread     -> the bodies thicken, the colour chain distorts more
 *   audioKick       -> the rims flare (light)
 *   audioMode       -> the light and the palette: cool in minor, warm in major
 *   audioSwell      -> the fog glow, the colour saturation and the width of the flight tube (slow)
 *
 * Knobs: spaceP / coreP / bodyP (the 3D chain, rolled per start), chainAP..chainDP
 * (the 2D colour chain, rolled per start), morphP (which colour stage morphs on
 * with the music), styleP (lit surface / glowing rims),
 * speedP (flight speed), detailP (texture sharpness), paletteP (photo colours /
 * colour field), hueP.
//@params spaceP coreP bodyP chainAP chainBP chainCP chainDP morphP styleP speedP detailP paletteP
//@audio audioSpread audioKick audioMode audioSwell
//@body
float gT, gTC, gSpread, gRot, gMw;
vec2 gCw, gCt;
'''
FIELD = r'''
vec3 zRepeat(vec3 q, float c) { q.z = c * (abs(mod(q.z / c - 1.0, 4.0) - 2.0) - 1.0); return q; }
float field3(vec3 p)
{
    int ks = pickStage(spaceP, 5); float vs = subVar(spaceP, 5);
    int kc = pickStage(coreP, 6);  float vc = subVar(coreP, 6);
    int kb = pickStage(bodyP, 5);  float vb = subVar(bodyP, 5);
    vec3 q;
    if (ks == 0) q = fRepeat(p, vec3(1.2 + 0.4 * vs));
    else if (ks == 1) { q = fPolarZ(p, 6.0 + 2.0 * floor(vs * 2.99)); q.x -= 2.2; q = zRepeat(q, 0.8); }
    else if (ks == 2) q = fRepeat(fTwistZ(p, 0.25 * sin(gT * 0.05)), vec3(1.4));
    else if (ks == 3) q = fOcta(fRepeat(p, vec3(1.5)));
    else q = fRepeat(fRot(p, vec3(0.0, 0.0, 1.0), 0.3 * sin(gRot)), vec3(1.2, 1.2, 1.8));
    float bs = 1.0;                                         // body size in the core's space
    if (kc == 1) {
        for (int i = 0; i < 3; ++i) { q = fTetra(q); q = fRot(q, vec3(1.0, 1.0, 0.0), gRot * 0.5 + 0.3 * vc); q = fScale(q, 1.7, vec3(0.45)); }
        bs = 1.4;
    } else if (kc == 2) {
        for (int i = 0; i < 3; ++i) { q = fOcta(q); q = fRot(q, vec3(0.0, 1.0, 1.0), gRot * 0.5 + 0.4 * vc); q = fScale(q, 1.6, vec3(0.6, 0.3, 0.2)); }
        bs = 1.4;
    } else if (kc == 3) {
        q = fSphere(q, 0.45 + 0.1 * vc, 1.0); q = fBox(q, 0.6); q = fRot(q, vec3(1.0, 1.0, 1.0), gRot * 0.5);
        bs = 1.0;
    } else if (kc == 4) {
        q = fAbs(q); q = fRot(q, vec3(0.0, 0.0, 1.0), 0.4 * sin(gRot) + vc); q = fAbs(q) - vec3(0.25 + 0.1 * vc); q = fRot(q, vec3(1.0, 0.0, 0.0), 0.3 * sin(gT * 0.07));
        bs = 0.8;
    } else if (kc == 5) {
        // Menger sponge: the octahedral fold (abs + sort), scale 3 about the
        // corner, the classic z shift; a slowly swaying axis between rounds.
        for (int i = 0; i < 3; ++i) {
            q = fOcta(q);
            q = fRot(q, vec3(1.0, 1.0, 1.0), 0.12 * sin(gRot) + 0.15 * vc);
            q = fScale(q, 3.0, vec3(2.0));
            if (q.z < -1.0) q.z += 2.0;
        }
        bs = 2.6;
    }
    gP = q;
    float th = 1.0 + 0.3 * gSpread;
    float d;
    if (kb == 0) d = sdBox3(q, vec3(0.35 + 0.1 * vb, 0.3, 0.35) * bs * th);
    else if (kb == 1) d = sdSphere3(q, 0.45 * bs * th);
    else if (kb == 2) d = sdTorus3(q.xzy, 0.5 * bs, 0.12 * bs * th);   // the ring lies in xy: z is the smallest axis after a sort
    else if (kb == 3) d = sdGyroid3(q * (3.0 / bs), 0.25 + 0.2 * gSpread) * bs / 3.0;
    else d = min(min(sdBox3(q, vec3(0.6, 0.08, 0.08) * bs * th), sdBox3(q, vec3(0.08, 0.6, 0.08) * bs * th)), sdBox3(q, vec3(0.08, 0.08, 0.6) * bs * th));
    return d / gDR * 0.8;
}
vec2 chain(vec2 uv)
{
    uv = stageA(uv);
    uv = mirrorUV(uv);
    uv = stageB(uv);
    uv = mirrorUV(uv);
    uv = stageC(uv);
    uv = mirrorUV(uv);
    return stageD(uv);
}
'''
t3 = io.open(os.path.join(SP, "src", "Chain3DTwistTorus.glsl"), encoding="utf-8").read()
m = t3.index("// One plane: the photo through the chain")
MAIN = t3[m:]
MAIN = MAIN.replace("    gSpread = clamp(audioSpread, 0.0, 1.0);\n",
    "    gSpread = clamp(audioSpread, 0.0, 1.0);\n"
    "    gTC = (0.03 + 0.06 * clamp(speedP, 0.0, 1.0)) * sceneTime + 0.25 * audioAdvance;\n"
    "    gMw = 0.012 * sceneTime + 0.15 * sceneAdvance;          // colour-chain morph position (integrated)\n"
    "    gCw = vec2(0.5) + 0.15 * vec2(sin(0.017 * sceneTime), cos(0.013 * sceneTime));\n"
    "    gCt = vec2(0.5) + vec2(0.22 * sin(0.023 * sceneTime + 0.3 * sin(0.011 * sceneTime)), 0.16 * cos(0.019 * sceneTime));\n")
io.open(os.path.join(SP, "src", "ChainLab3D.glsl"), "w", encoding="utf-8").write(HEAD + STAGES + FIELD + MAIN)
print("ok")
