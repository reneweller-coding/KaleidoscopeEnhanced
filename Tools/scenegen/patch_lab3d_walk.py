# -*- coding: utf-8 -*-
"""One-off patch (30.09.): ChainLab3D -- the structure walks (space/core/body,
two worlds mixed while one fades), new classes (helix and hexagonal lattice
spaces, a Kleinian fold core), energy order for the structure classes, and the
relief (the surface normal tilted by the colour chain's slope)."""
import io, os
SP = os.path.dirname(os.path.abspath(__file__))
p = os.path.join(SP, "make_chainlab3d.py")
s = io.open(p, encoding="utf-8").read()

a = s.index("vec3 zRepeat(vec3 q, float c)")
b = s.index("vec2 chain(vec2 uv)")
FIELD = r'''vec3 zRepeat(vec3 q, float c) { q.z = c * (abs(mod(q.z / c - 1.0, 4.0) - 2.0) - 1.0); return q; }
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
// The structure classes in order of energy (calm .. energetic), as the chain's:
// the music's energy picks the region of the world too.
const int ORD_SP[7] = int[7](0, 3, 6, 4, 2, 5, 1);   // lattice, octahedral lattice, hexagons, turning, twisted, helix, polar ring tunnel
const int ORD_CO[7] = int[7](0, 4, 3, 6, 1, 2, 5);   // none, plane folds, sphere-inversion box, Kleinian, tetra KIFS, octa KIFS, Menger
const int ORD_BO[7] = int[7](1, 2, 3, 5, 6, 0, 4);   // balls, tori, gyroid, Schwarz P, Schwarz D, blocks, crosses
// The app walks the structure too (EffectShader::stepChainWalk): (shown, target, fade).
uniform vec3 walkSpace, walkCore, walkBody;

// One world: a space, a fold core and a body, each a knob value on its energy scale.
float fieldK(vec3 p, float xs, float xc, float xb)
{
    gDR = 1.0;
    int ks = ORD_SP[pickStage(xs, 7)]; float vs = subVar(xs, 7);
    int kc = ORD_CO[pickStage(xc, 7)]; float vc = subVar(xc, 7);
    int kb = ORD_BO[pickStage(xb, 7)]; float vb = subVar(xb, 7);
    vec3 q;
    if (ks == 0) q = fRepeat(p, vec3(1.2 + 0.4 * vs));
    else if (ks == 1) { q = fPolarZ(p, 6.0 + 2.0 * floor(vs * 2.99)); q.x -= 2.2; q = zRepeat(q, 0.8); }
    else if (ks == 2) q = fRepeat(fTwistZ(p, 0.25 * sin(gT * 0.05)), vec3(1.4));
    else if (ks == 3) q = fOcta(fRepeat(p, vec3(1.5)));
    else if (ks == 4) q = fRepeat(fRot(p, vec3(0.0, 0.0, 1.0), 0.3 * sin(gRot)), vec3(1.2, 1.2, 1.8));
    else if (ks == 5) {                                     // helix: a ring of blocks wound along the flight (a spiral staircase)
        q = fPolarZ(fTwistZ(p, 0.3 + 0.2 * vs), 5.0 + 2.0 * floor(vs * 2.99)); q.x -= 2.0; q = zRepeat(q, 0.7);
    }
    else q = zRepeat(fHexXY(p, 2.2 + 0.6 * vs), 1.2);        // hexagonal lattice: a honeycomb of pillars
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
        for (int i = 0; i < 4; ++i) {
            q = 2.0 * clamp(q, -vec3(0.8, 0.8, 1.0), vec3(0.8, 0.8, 1.0)) - q;
            float k = max((1.05 + 0.3 * vc) / max(dot(q, q), 1e-4), 1.0);
            q *= k; gDR *= k;
        }
        bs = 0.7;
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
'''
s = s[:a] + FIELD + s[b:]

# relief: knob + bump in the shading
s = s.replace("//@params spaceP coreP bodyP solidP chainAP", "//@params spaceP coreP bodyP solidP reliefP chainAP")
s = s.replace(" * time axis), chainAP..chainDP",
              " * time axis), reliefP (the surfaces bulge with the colour chain's brightness),\n * chainAP..chainDP")
s = s.replace("space\n * (mirrored lattice, polar ring tunnel, twisted lattice, octahedral lattice,\n * turning lattice)",
              "space\n * (mirrored lattice, polar ring tunnel, twisted lattice, octahedral lattice,\n * turning lattice, helix, hexagonal lattice)")
s = s.replace("sphere-inversion box fold, plane folds, Menger sponge)", "sphere-inversion box fold, plane folds, Menger sponge,\n * Kleinian fold)")
old = 'MAIN = MAIN.replace("vec3 tex = photoChain3(fp, n, lod, ", "vec3 tex = colour3(fp, n, lod, ")\n'
assert s.count(old) == 1
s = s.replace(old, old + r'''RELIEF = """
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
MAIN = MAIN.replace("void main()", RELIEF + "\\nvoid main()", 1)
MAIN = MAIN.replace("        vec3 tex = colour3(fp, n, lod, ", """        if (reliefP > 0.3) {                                    // a knob: every pixel takes the same branch
            vec3 t1 = normalize(cross(n, abs(n.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))), t2 = cross(n, t1);
            float e = 0.006 * max(t, 1.0), hl = lod + 1.5;
            float h0 = reliefH(q, n, hl);
            vec3 g = t1 * (reliefH(q + t1 * e, n, hl) - h0) + t2 * (reliefH(q + t2 * e, n, hl) - h0);
            n = normalize(n - g / e * 0.05 * smoothstep(0.3, 1.0, reliefP));
        }
        vec3 tex = colour3(fp, n, lod, """, 1)
assert "reliefH(q + t1" in MAIN
''')
io.open(p, "w", encoding="utf-8", newline="\n").write(s)
print("ok")
