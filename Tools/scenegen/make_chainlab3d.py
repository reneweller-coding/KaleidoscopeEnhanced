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
 * turning lattice, helix, hexagonal lattice, a lattice turned in 4D), a fold core (none, tetrahedral KIFS, octahedral KIFS, a
 * sphere-inversion box fold, plane folds, Menger sponge,
 * Kleinian fold, icosahedral KIFS, polyhedral kaleidoscope) and an end body (block, ball, torus, gyroid
 * membrane, cross, Schwarz P and D minimal surfaces).  The surfaces are coloured by a rolled 2D chain of the
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
 * Knobs: spaceP / coreP / bodyP (the 3D chain, rolled per start), solidP (the colour
 * chain projected on three planes, or as a solid texture with the depth as its
 * time axis), reliefP (the surfaces bulge with the colour chain's brightness),
 * chainAP..chainDP
 * (the 2D colour chain, rolled per start), morphP (which colour stage morphs on
 * with the music), styleP (lit surface / glowing rims),
 * speedP (flight speed), detailP (texture sharpness), paletteP (photo colours /
 * colour field), hueP.
//@params spaceP coreP bodyP solidP reliefP chainAP chainBP chainCP chainDP morphP styleP speedP detailP paletteP
//@audio audioSpread audioKick audioMode audioSwell
//@body
float gT, gTC, gSpread, gRot, gMw;
vec2 gCw, gCt;
'''
FIELD = r'''
vec3 zRepeat(vec3 q, float c) { q.z = c * (abs(mod(q.z / c - 1.0, 4.0) - 2.0) - 1.0); return q; }
// Six-fold mirror lattice across the tube (p6m in xy): nearest hexagon
// centre, then the angle folded into a 30-degree wedge -- mirror symmetric,
// so the pieces meet without seams.
vec3 fHexXY(vec3 p, float cell)
{
    vec2 q = p.xy / cell;
    const vec2 s = vec2(1.0, 1.7320508);
    vec2 a = mod(q, s) - s * 0.5, b = mod(q - s * 0.5, s) - s * 0.5;
    vec2 h = dot(a, a) < dot(b, b) ? a : b;
    float an = abs(mod(atan(h.y, h.x), 1.0471976) - 0.5235988);
    return vec3(length(h) * vec2(cos(an), sin(an)) * cell, p.z);
}
// The structure classes in order of energy (calm .. energetic), as the chain's
// (if-chains, not const arrays: NVIDIA returned entry 0 for three arrays
// indexed in one function -- the body never changed):
// the music's energy picks the region of the world too.
int ordsp(int i) { if (i == 0) return 0; if (i == 1) return 3; if (i == 2) return 6; if (i == 3) return 7; if (i == 4) return 9; if (i == 5) return 4; if (i == 6) return 2; if (i == 7) return 5; if (i == 8) return 8; return 1; }   // lattice, octa lattice, hexagons, 4D lattice, log-spherical Droste, turning, twisted, helix, inverted lattice, polar ring tunnel
int ordco(int i) { if (i == 0) return 0; if (i == 1) return 4; if (i == 2) return 8; if (i == 3) return 3; if (i == 4) return 9; if (i == 5) return 6; if (i == 6) return 1; if (i == 7) return 7; if (i == 8) return 2; return 5; }   // none, plane folds, polyhedral, sphere-inversion box, hyperbolic honeycomb, Kleinian, tetra, icosa, octa, Menger
int ordbo(int i) { if (i == 0) return 1; if (i == 1) return 2; if (i == 2) return 3; if (i == 3) return 5; if (i == 4) return 6; if (i == 5) return 0; return 4; }   // balls, tori, gyroid, Schwarz P, Schwarz D, blocks, crosses
// The app walks the structure too (EffectShader::stepChainWalk): (shown, target, fade).
uniform vec3 walkSpace, walkCore, walkBody;

// One world: a space, a fold core and a body, each a knob value on its energy scale.
float fieldK(vec3 p, float xs, float xc, float xb)
{
    gDR = 1.0;
    int ks = ordsp(pickStage(xs, 10)); float vs = subVar(xs, 10);
    int kc = ordco(pickStage(xc, 10)); float vc = subVar(xc, 10);
    int kb = ordbo(pickStage(xb, 7)); float vb = subVar(xb, 7);
    vec3 q;
    if (ks == 0) q = fRepeat(p, vec3(1.2 + 0.4 * vs));
    else if (ks == 1) { q = fPolarZ(p, 6.0 + 2.0 * floor(vs * 2.99)); q.x -= 2.2; q = zRepeat(q, 0.8); }
    else if (ks == 2) q = fRepeat(fTwistZ(p, 0.25 * sin(gT * 0.05)), vec3(1.4));
    else if (ks == 3) q = fOcta(fRepeat(p, vec3(1.5)));
    else if (ks == 4) q = fRepeat(fRot(p, vec3(0.0, 0.0, 1.0), 0.3 * sin(gRot)), vec3(1.2, 1.2, 1.8));
    else if (ks == 5) {                                     // helix: a ring of blocks wound along the flight (a spiral staircase)
        q = fPolarZ(fTwistZ(p, 0.3 + 0.2 * vs), 5.0 + 2.0 * floor(vs * 2.99)); q.x -= 2.0; q = zRepeat(q, 0.7);
    }
    else if (ks == 6) q = zRepeat(fHexXY(p, 2.2 + 0.6 * vs), 1.2);
    else if (ks == 8) {                                     // inverted lattice: lattice, inversion per cell, lattice again
        q = fRepeat(p, vec3(1.7 + 0.3 * vs)); q = fInvert(q + vec3(0.3, 0.2, 0.0), 1.4);   // in every cell a sphere inversion
        q = fRepeat(fScale(q, 1.6, vec3(0.0)), vec3(1.3));                                   // ... of a lattice: a bubble world per cell
    }
    else if (ks == 9) q = fRepeat(fScale(fLogSphere(p, gCam + vec3(0.0, 0.0, 6.0), 2.5 + vs, gT * 0.05), 2.5, vec3(0.0)), vec3(1.4));   // 3D Droste shells
    else if (ks == 7) q = f4DLattice(p, 1.3 + 0.3 * vs, 0.35 * sin(gT * 0.04) + gRot * 0.3, 0.25 * sin(gT * 0.031 + 1.0), 0.6 * sin(gT * 0.023));   // 4D-rotated lattice        // hexagonal lattice: a honeycomb of pillars
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
    } else if (kc == 6) {
        // Kleinian (pseudo-Kleinian) fold: box folds and sphere inversions,
        // endlessly nested grottoes; max() keeps the inversion continuous.
        q = fScale(q, 1.8, vec3(0.0));                      // the cells are small: grow them into the folds' reach
        for (int i = 0; i < 4; ++i) {
            q = 2.0 * clamp(q, -vec3(0.8, 0.8, 1.0), vec3(0.8, 0.8, 1.0)) - q;
            float k = max((1.05 + 0.3 * vc) / max(dot(q, q), 1e-4), 1.0);
            q *= k; gDR *= k;
        }
        bs = 0.7;
    }
    else if (kc == 7) {
        // icosahedral KIFS (Knighty): the icosahedral fold, a turn, scale 2
        for (int i = 0; i < 3; ++i) { q = fPoly(q, 5.0); q = fRot(q, vec3(1.0, 1.0, 1.0), gRot * 0.4 + 0.3 * vc); q = fScale(q, 1.9, vec3(0.55, 0.3, 0.9)); }
        bs = 1.2;
    } else if (kc == 8) {
        // polyhedral kaleidoscope: one polyhedral fold (tetra / octa / icosa by the
        // sub-variant) around each lattice cell, the body pushed off the axis
        q = fPoly(q, 3.0 + floor(vc * 2.99)); q.z -= 0.35;
        bs = 0.7;
    }
    else if (kc == 9) {
        // hyperbolic honeycomb: the cell mapped into the Poincare ball, folded
        q = fHyperBall(q * 0.8, 0.85 + 0.1 * vc) / 0.8;
        bs = 0.45;
    }
    gP = q;
    float th = 1.0 + 0.3 * gSpread;
    float d;
    if (kb == 0) d = sdBox3(q, vec3(0.35 + 0.1 * vb, 0.3, 0.35) * bs * th);
    else if (kb == 1) d = sdSphere3(q, 0.45 * bs * th);
    else if (kb == 2) d = sdTorus3(q.xzy, 0.5 * bs, 0.12 * bs * th);   // the ring lies in xy: z is the smallest axis after a sort
    else if (kb == 3) d = sdGyroid3(q * (3.0 / bs), 0.25 + 0.2 * gSpread) * bs / 3.0;
    else if (kb == 5) { vec3 w = q * (3.0 / bs); d = (abs(cos(w.x) + cos(w.y) + cos(w.z)) - 0.35 - 0.3 * gSpread) / 2.2 * bs / 3.0; }   // Schwarz P
    else if (kb == 6) { vec3 w = q * (3.0 / bs); vec3 sn = sin(w), cs = cos(w);                     // Schwarz D
        d = (abs(sn.x * sn.y * sn.z + sn.x * cs.y * cs.z + cs.x * sn.y * cs.z + cs.x * cs.y * sn.z) - 0.25 - 0.2 * gSpread) / 2.2 * bs / 3.0; }
    else d = min(min(sdBox3(q, vec3(0.6, 0.08, 0.08) * bs * th), sdBox3(q, vec3(0.08, 0.6, 0.08) * bs * th)), sdBox3(q, vec3(0.08, 0.08, 0.6) * bs * th));
    return d / gDR * 0.8;
}
// The world, walking: while the app fades one structure stage, the two worlds'
// distance fields are mixed -- continuous, the architecture melts into the next.
float field3(vec3 p)
{
    float xs = spaceP, xc = coreP, xb = bodyP, ys = xs, yc = xc, yb = xb, f = 0.0;
    if (walkHost > 0.5 && walkAll()) {
        xs = walkSpace.x; xc = walkCore.x; xb = walkBody.x;
        ys = walkSpace.y; yc = walkCore.y; yb = walkBody.y;
        f = smoothstep(0.0, 1.0, max(walkSpace.z, max(walkCore.z, walkBody.z)));   // one structure stage fades at a time
    }
    float d0 = fieldK(p, xs, xc, xb);
    if (f <= 0.0) return d0;
    vec3 p0 = gP;
    float d1 = fieldK(p, ys, yc, yb);
    gP = mix(p0, gP, f);
    return mix(d0, d1, f);
}
vec2 chain(vec2 uv)
{
    gIdW = 1.0;
    uv = stageA(uv);
    uv = mirrorUV(uv);
    uv = stageB(uv);
    uv = mirrorUV(uv);
    uv = stageC(uv);
    uv = mirrorUV(uv);
    uv = stageD(uv);
    // Never an empty chain: as the stages together approach 'none' (gIdW), a
    // calm six-fold kaleidoscope fades in -- the bare photo is never shown.
    if (gIdW > 0.0) uv = morphMix(uv, tKaleido(mirrorUV(uv), gCw, 6.0, gRot), gIdW);
    return uv;
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
SOLID = r"""
// The solid chain texture: time as the third axis.  A 2D chain whose
// parameters run with time IS a volume (x, y, t).  One time axis alone is not
// isotropic (a face along it cuts the volume in a line and smears it), so each
// of the three planes reads the chain with the coordinate ALONG ITS NORMAL as
// its time, and the normal picks the plane that faces the surface: no streaks,
// and every depth shows its own phase of the chain, like a carved block --
// while the real time keeps the whole block changing.
vec3 chainSlice(vec2 uv, float depth, float lod, float pal)
{
    float tc = gTC, tr = gRot;
    gTC += 0.3 * depth;
    gRot += 0.15 * depth;
    vec3 c = chainPlane(uv, lod, pal);
    gTC = tc; gRot = tr;
    return c;
}
vec3 solidChain3(vec3 q, vec3 n, float lod, float pal)
{
    vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
    return chainSlice(q.yz * 0.35 + 0.5, q.x, lod, pal) * w.x + chainSlice(q.zx * 0.35 + 0.5, q.y, lod, pal) * w.y
         + chainSlice(q.xy * 0.35 + 0.5, q.z, lod, pal) * w.z;
}
vec3 colour3(vec3 q, vec3 n, float lod, float pal)
{
    return solidP >= 0.5 ? solidChain3(q, n, lod, pal) : photoChain3(q, n, lod, pal);
}
"""
MAIN = MAIN.replace("void main()", SOLID + "\nvoid main()", 1)
MAIN = MAIN.replace("vec3 tex = photoChain3(fp, n, lod, ", "vec3 tex = colour3(fp, n, lod, ")
RELIEF = """
// Relief: the brightness of the colour chain as height -- the normal is tilted
// by its slope, measured in the world along two tangents (each sample folds its
// point like the surface), so the light follows the bumps.
float reliefH(vec3 qw, vec3 n, float lod)
{
    fieldD(qw);
    vec3 w = abs(n), fq = gP;
    vec2 uv = (w.x > w.y && w.x > w.z) ? fq.yz : (w.y > w.z ? fq.zx : fq.xy);
    return luma(chainPlane(uv * 0.35 + 0.5, lod, 0.0));
}
"""
MAIN = MAIN.replace("void main()", RELIEF + "\nvoid main()", 1)
MAIN = MAIN.replace("        vec3 tex = colour3(fp, n, lod, ", """        vec3 nGeo = n;                                          // texture on the geometric normal, light on the bumped one
        if (reliefP > 0.3) {                                    // a knob: every pixel takes the same branch
            vec3 t1 = normalize(cross(n, abs(n.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))), t2 = cross(n, t1);
            float e = 0.006 * max(t, 1.0), hl = lod + 1.5;
            float h0 = reliefH(q, n, hl);
            vec3 g = t1 * (reliefH(q + t1 * e, n, hl) - h0) + t2 * (reliefH(q + t2 * e, n, hl) - h0);
            n = normalize(n - g / e * 0.05 * smoothstep(0.3, 1.0, reliefP));
        }
        vec3 tex = colour3(fp, nGeo, lod, """, 1)
assert "reliefH(q + t1" in MAIN
assert "colour3(fp" in MAIN
io.open(os.path.join(SP, "src", "ChainLab3D.glsl"), "w", encoding="utf-8").write(HEAD + STAGES + FIELD + MAIN)
print("ok")
