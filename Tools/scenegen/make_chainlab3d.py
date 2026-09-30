# -*- coding: utf-8 -*-
"""Build src/ChainLab3D.glsl: rolled 3D fold chains, coloured by the 2D lab's stage machine."""
import io, os, re
SP = os.path.dirname(os.path.abspath(__file__))
lab2 = io.open(os.path.join(SP, "src", "ChainLab2D.glsl"), encoding="utf-8").read()
a = lab2.index("// The stage index and a sub-variant")
b = lab2.index("vec2 chain(vec2 p)")
STAGES = re.sub(r"\bgT\b", "gTC", lab2[a:b])      # the colour chain flows at the 2D lab's calm pace
# The colour chain keeps its rolled order but does not walk it: the order fade
# evaluates the whole chain twice, and the chain is inlined at every one of the
# lab's call sites -- it tripled the cold compile time.  Without the walkO
# uniform the app never starts an order walk here (EffectShader::startWalk).
_ow = "    if (walkHost > 0.5 && walkAll()) { o0 = pickStage(walkO.x, 24); o1 = pickStage(walkO.y, 24); f = smoothstep(0.0, 1.0, walkO.z); }\n"
assert STAGES.count(_ow) == 1
STAGES = STAGES.replace(_ow, "").replace("uniform vec3 walkO;\n", "")
# The quasicrystal mirrors are too heavy for the colour chain, which runs up to
# six times per pixel here (49-59 fps with them); see labsubset.py.
import chain_classes as _cc, labsubset
STAGES = labsubset.apply(STAGES, _cc.LAB3D_EXCLUDE, "3D lab")
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
//@params spaceP coreP bodyP solidP reliefP chainAP chainBP chainCP chainDP orderP morphP styleP speedP detailP paletteP
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
int ordsp(int i) { if (i == 0) return 0; if (i == 1) return 3; if (i == 2) return 15; if (i == 3) return 6; if (i == 4) return 19; if (i == 5) return 7; if (i == 6) return 9; if (i == 7) return 17; if (i == 8) return 14; if (i == 9) return 4; if (i == 10) return 16; if (i == 11) return 10; if (i == 12) return 12; if (i == 13) return 2; if (i == 14) return 11; if (i == 15) return 18; if (i == 16) return 5; if (i == 17) return 13; if (i == 18) return 8; return 1; }   // energy order, 20 classes
int ordco(int i) { if (i == 0) return 0; if (i == 1) return 4; if (i == 2) return 8; if (i == 3) return 3; if (i == 4) return 20; if (i == 5) return 15; if (i == 6) return 18; if (i == 7) return 9; if (i == 8) return 6; if (i == 9) return 11; if (i == 10) return 10; if (i == 11) return 16; if (i == 12) return 12; if (i == 13) return 1; if (i == 14) return 19; if (i == 15) return 14; if (i == 16) return 7; if (i == 17) return 13; if (i == 18) return 2; if (i == 19) return 21; if (i == 20) return 5; return 17; }   // energy order, 22 classes
int ordbo(int i) { if (i == 0) return 1; if (i == 1) return 21; if (i == 2) return 9; if (i == 3) return 7; if (i == 4) return 17; if (i == 5) return 18; if (i == 6) return 10; if (i == 7) return 2; if (i == 8) return 11; if (i == 9) return 19; if (i == 10) return 3; if (i == 11) return 5; if (i == 12) return 6; if (i == 13) return 12; if (i == 14) return 13; if (i == 15) return 0; if (i == 16) return 16; if (i == 17) return 8; if (i == 18) return 14; if (i == 19) return 15; if (i == 20) return 4; return 20; }   // energy order, 22 classes
// The app walks the structure too (EffectShader::stepChainWalk): (shown, target, fade).
uniform vec3 walkSpace, walkCore, walkBody;

// One world: a space, a fold core and a body, each a knob value on its energy scale.
float fieldK(vec3 p, float xs, float xc, float xb)
{
    gDR = 1.0;
    int ks = ordsp(pickStage(xs, 20)); float vs = subVar(xs, 20);
    int kc = ordco(pickStage(xc, 22)); float vc = subVar(xc, 22);
    int kb = ordbo(pickStage(xb, 22)); float vb = subVar(xb, 22);
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
    else if (ks == 12) q = fRepeat(fHalfSpace(p, 1.0), vec3(1.3));                  // hyperbolic half-space
    else if (ks == 13) { q = fPolarZ(fTwistZ(p, 0.6 + 0.3 * vs), 2.0); q.x -= 1.4; q = zRepeat(q, 0.6); }   // double helix
    else if (ks == 14) q = fRepeat(fLogCyl(p, 2.5 + vs), vec3(1.2));                  // log-cylindrical Droste
    else if (ks == 15) q = fPoly(fRepeat(p, vec3(1.6)), 5.0);                        // icosahedral lattice
    else if (ks == 16) { q = fRepeat(p, vec3(1.5)); float kb2 = 0.35 + 0.25 * vs; q.xy = rot2(kb2 * q.x) * q.xy; gDR *= 1.0 + 1.5 * kb2; }   // bent cells
    else if (ks == 17) { vec3 cc = gCam + vec3(0.0, 0.0, 6.0); float lr = log(max(length(p - cc), 1e-3));
        q = fLogSphere(p, cc, 2.5 + vs, gT * 0.05); q.xy = rot2(0.9 * lr) * q.xy; gDR *= 1.9; q = fRepeat(fScale(q, 2.5, vec3(0.0)), vec3(1.4)); }   // twisted 3D Droste
    else if (ks == 18) { float ws = 0.3 + 0.2 * vs; q = fRepeat(fWarp(p, ws, gT * 0.05), vec3(1.4)); }   // noise-warped lattice
    else if (ks == 19) q = fRollZ(p, 3.2 + vs, 1.2);                                   // the world rolled round the flight axis
    else if (ks == 10) q = fTorusWrap(p, 7.0 + 3.0 * vs, 1.3);                       // the world wrapped round a great ring
    else if (ks == 11) q = fRepeat(fGyroidWarp(p, 0.25 + 0.15 * vs, gT * 0.05), vec3(1.4));   // gyroid-warped lattice
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
    else if (kc == 10) {
        // 'amazing surface' (Kali): box folds in xy only, sphere fold, turn, scale --
        // layered, sheet-like fractal terraces
        for (int i = 0; i < 3; ++i) {
            q.xy = clamp(q.xy, -1.0, 1.0) * 2.0 - q.xy;
            float r2 = max(dot(q, q), 1e-4);
            float k = r2 < 0.25 ? 4.0 : (r2 < 1.0 ? 1.0 / r2 : 1.0);
            q *= k; gDR *= k;
            q = fRot(q, vec3(0.0, 0.0, 1.0), 0.3 + 0.4 * vc + 0.2 * sin(gRot));
            q = fScale(q, 1.25, vec3(0.0));
        }
        bs = 3.0;   /* spot check: 4 rounds x 1.5 turned to noise; bodies must be large after the folds */
    }
    else if (kc == 11) {                                    // pseudo-Kleinian (Knighty's constants)
        const vec3 CS = vec3(0.92436, 0.90756, 0.92436);
        for (int i = 0; i < 5; ++i) {
            q = 2.0 * clamp(q, -CS, CS) - q;
            float k = max((1.0 + 0.15 * vc) / max(dot(q, q), 1e-4), 1.0);
            q *= k; gDR *= k;
        }
        bs = 0.6;
    } else if (kc == 12) {                                  // kaliset: abs(p)/|p|^2 - c
        for (int i = 0; i < 4; ++i) {
            float r2 = max(dot(q, q), 0.08);
            q = abs(q) / r2 - vec3(0.5 + 0.3 * vc, 0.4, 0.6); gDR /= r2;
        }
        bs = 0.9;
    } else if (kc == 13) {                                  // dodecahedral KIFS
        for (int i = 0; i < 3; ++i) { q = fPoly(q, 5.0); q = fRot(q, vec3(0.0, 0.0, 1.0), gRot * 0.3 + 0.2 * vc); q = fScale(q, 2.0, vec3(0.0, 0.53, 0.85)); }
        bs = 1.2;
    } else if (kc == 14) {                                  // Sierpinski octahedron
        for (int i = 0; i < 3; ++i) { q = fOcta(q); q = fRot(q, vec3(1.0, 1.0, 1.0), gRot * 0.3 + 0.2 * vc); q = fScale(q, 2.0, vec3(1.0, 0.0, 0.0)); }
        bs = 1.8;
    } else if (kc == 15) {                                  // Apollonian sphere packing
        for (int i = 0; i < 3; ++i) {
            q = abs(fract(q * 0.25 + 0.25) * 4.0 - 2.0) - 1.0;   // mirrored repeat (continuous)
            float k = (1.1 + 0.2 * vc) / max(dot(q, q), 1e-3);
            q *= k; gDR *= k;
        }
        bs = 1.6;
    }
    else if (kc == 16) {                                    // Mandelbulb (power 8): its own distance estimate
        vec3 z = q * 1.3, c0 = z; float dr = 1.0, r = length(z);
        for (int i = 0; i < 3; ++i) {
            r = length(z); if (r > 2.0) break;
            float th0 = acos(clamp(z.z / max(r, 1e-4), -1.0, 1.0)) * 8.0 + gRot * 0.3, ph0 = atan(z.y, z.x) * 8.0;
            dr = pow(r, 7.0) * 8.0 * dr + 1.0;
            z = pow(r, 8.0) * vec3(sin(th0) * cos(ph0), sin(th0) * sin(ph0), cos(th0)) + c0;
        }
        r = length(z);
        gP = c0;
        return 0.5 * log(max(r, 1e-4)) * r / dr / 1.3 / gDR * 0.8;
    } else if (kc == 17) {                                  // cross-Menger: Menger folds, scale 2.4 about the arm
        for (int i = 0; i < 3; ++i) { q = fOcta(q); q = fScale(q, 2.4, vec3(1.4, 1.4, 0.0)); if (q.z < -0.7) q.z += 1.4; }
        bs = 2.2;
    } else if (kc == 18) {                                  // Mandalay box: octahedral fold, box fold, sphere fold
        for (int i = 0; i < 2; ++i) { q = fOcta(q); q = fBox(q, 0.8); q = fSphere(q, 0.4, 1.0); q = fScale(q, 1.6, vec3(0.4, 0.2, 0.1) * (1.0 + vc)); }
        bs = 2.4;   /* spot check: 3 rounds turned to dust */
    } else if (kc == 19) {                                  // mixed Sierpinski: tetra and octa folds alternating
        for (int i = 0; i < 4; ++i) { if (i == 1 || i == 3) q = fOcta(q); else q = fTetra(q); q = fScale(q, 1.8, vec3(0.8 + 0.3 * vc)); }
        bs = 1.6;
    } else if (kc == 20) {                                  // spherical KIFS: abs, sphere fold, turn, scale 2
        for (int i = 0; i < 3; ++i) { q = abs(q); q = fSphere(q, 0.4, 0.9); q = fRot(q, vec3(1.0, 1.0, 1.0), gRot * 0.3 + 0.3 * vc); q = fScale(q, 2.0, vec3(0.9)); }
        bs = 1.3;
    } else if (kc == 21) {                                  // twisted octahedral KIFS: the turn grows per round
        for (int i = 0; i < 3; ++i) { q = fOcta(q); q = fRot(q, vec3(0.2, 1.0, 0.5), gRot * 0.4 + 0.35 * float(i + 1) + vc); q = fScale(q, 1.6, vec3(0.45, 0.22, 0.08)); }
        bs = 2.6;   /* spot check: the bodies had been pushed out of the cells */
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
    else if (kb == 7) d = sdOcta3(q, 0.6 * bs * th);
    else if (kb == 9) d = sdSuperquad(q, 0.5 * bs * th, 2.5 + 6.0 * vb);                     // superquadric
    else if (kb == 10) d = max(abs(length(q) - 0.5 * bs * th) - 0.05 * bs, -sdOcta3(q, 0.75 * bs));   // hollow sphere
    else if (kb == 11) { vec3 w = q; w.x -= clamp(w.x, -0.25 * bs, 0.25 * bs); d = sdTorus3(w.xzy, 0.3 * bs, 0.07 * bs * th); }   // chain link
    else if (kb == 12) d = sdNeovius(q * (3.0 / bs), 0.4 + 0.8 * gSpread) * bs / 3.0;          // Neovius surface
    else if (kb == 13) d = sdLidinoid(q * (3.0 / bs), 0.05 + 0.05 * gSpread) * bs / 3.0;       // Lidinoid                                  // octahedron
    else if (kb == 8) d = min(min(length(q.xy), length(q.yz)), length(q.zx)) - 0.1 * bs * th;   // rod lattice
    else if (kb == 14) d = min(sdTetra3(q, 0.4 * bs * th), sdTetra3(-q, 0.4 * bs * th));   // stellated octahedron
    else if (kb == 15) d = max(max(length(q.xy), length(q.yz)), length(q.zx)) - 0.4 * bs * th;   // Steinmetz tricylinder
    else if (kb == 16) { vec3 w = q; w.xz = rot2(q.y * 2.5) * w.xz; d = sdBox3(w, vec3(0.16, 0.6, 0.16) * bs * th) * 0.6; }   // twisted pillar
    else if (kb == 17) d = (max(max(abs(q.x) + abs(q.y), abs(q.y) + abs(q.z)), abs(q.z) + abs(q.x)) - 0.6 * bs * th) * 0.7071;   // rhombic dodecahedron
    else if (kb == 18) d = sdIcosa3(q, 0.45 * bs * th);                                  // icosahedron
    else if (kb == 19) { float R = 0.38 * bs, r0 = 0.07 * bs * th; vec3 a = q + vec3(0.2 * bs, 0.0, 0.0), b = q - vec3(0.2 * bs, 0.0, 0.0);
        d = min(length(vec2(length(a.xy) - R, a.z)) - r0, length(vec2(length(b.xz) - R, b.y)) - r0); }   // linked rings
    else if (kb == 20) { float rho = length(q.xy), Rr = 0.45 * bs + 0.06 * bs * smoothstep(-0.3, 0.3, sin(12.0 * atan(q.y, q.x)));
        d = max(max(rho - Rr, 0.2 * bs - rho), abs(q.z) - 0.08 * bs * th) * 0.7; }   // gear
    else if (kb == 21) { vec3 w = q; w.x -= clamp(w.x, -0.3 * bs, 0.3 * bs); d = length(w) - 0.15 * bs * th; }   // pill
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
    return runChain(uv);
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
    // One triplanar projection for both looks: the solid texture is the same
    // three planes with the depth along each normal as the chain's time (the
    // photo look has depth 0) -- three chain call sites instead of six.
    float sd = solidP >= 0.5 ? 1.0 : 0.0;
    // Planes with a small weight are skipped: the weights are shifted down so
    // they reach exactly zero (no seam), and most surface points then read one
    // or two planes instead of three (the chain has no derivatives, so the
    // branches are safe).
    vec3 w = max(pow(abs(n), vec3(4.0)) - 0.03, 0.0); w /= (w.x + w.y + w.z);
    vec3 c = vec3(0.0);
    if (w.x > 0.0) c += chainSlice(q.yz * 0.35 + 0.5, q.x * sd, lod, pal) * w.x;
    if (w.y > 0.0) c += chainSlice(q.zx * 0.35 + 0.5, q.y * sd, lod, pal) * w.y;
    if (w.z > 0.0) c += chainSlice(q.xy * 0.35 + 0.5, q.z * sd, lod, pal) * w.z;
    return c;
}
"""
MAIN = MAIN.replace("void main()", SOLID + "\nvoid main()", 1)
MAIN = MAIN.replace("vec3 tex = photoChain3(fp, n, lod, ", "vec3 tex = colour3(fp, n, lod, ")
RELIEF = """
// Relief: the brightness of the colour chain as height -- the normal is tilted
// by its slope, sampled around the folded surface point (no extra evaluation
// of the field -- each would inline it once more), so the light follows the bumps.
float reliefH(vec3 fq, vec3 n, float lod)
{
    vec3 w = abs(n);
    vec2 uv = (w.x > w.y && w.x > w.z) ? fq.yz : (w.y > w.z ? fq.zx : fq.xy);
    return luma(chainPlane(uv * 0.35 + 0.5, lod, 0.0));
}
"""
MAIN = MAIN.replace("void main()", RELIEF + "\nvoid main()", 1)
MAIN = MAIN.replace("        vec3 tex = colour3(fp, n, lod, ", """        vec3 nGeo = n;                                          // texture on the geometric normal, light on the bumped one
        if (reliefP > 0.3) {                                    // a knob: every pixel takes the same branch
            vec3 t1 = normalize(cross(n, abs(n.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))), t2 = cross(n, t1);
            float e = 0.006 * max(t, 1.0), hl = lod + 1.5;
            // sampled in the folded space around fp (the fold stretches by fdr there)
            float ef = e * fdr, h0 = reliefH(fp, n, hl);
            vec3 g = t1 * (reliefH(fp + t1 * ef, n, hl) - h0) + t2 * (reliefH(fp + t2 * ef, n, hl) - h0);
            n = normalize(n - g / e * 0.05 * smoothstep(0.3, 1.0, reliefP));
        }
        vec3 tex = colour3(fp, nGeo, lod, """, 1)
assert "reliefH(fp + t1" in MAIN
assert "colour3(fp" in MAIN
io.open(os.path.join(SP, "src", "ChainLab3D.glsl"), "w", encoding="utf-8").write(HEAD + STAGES + FIELD + MAIN)
print("ok")
