# -*- coding: utf-8 -*-
"""Build src/ChainSlice3D.glsl: the 3D lab's world, cut by planes instead of raymarched.

The 3D lab's world is a chain of 3D space transforms (space -> fold core ->
body distance).  Here the screen is a plane through that world: every pixel is
ONE point in space, sent through the chain once -- no march.  Up to eight
planes behind it (layerP) show the first one that cuts matter, a stack of cut
plates with the deeper ones through the holes.  The colour is the 3D lab's
(the 2D chain on three projection planes of the folded point), the light falls
on the distance field's gradient: the bodies' cut edges glow as rims.

Built from src/ChainLab3D.glsl (make_chainlab3d.py), so both labs share their
classes; the app runs it like the 3D lab (Engine/ChainPass: Geom_/Final_ by
make_chainpass.write_3d, the world classes as #if constants via ShaderForge).
"""
import io, os
SP = os.path.dirname(os.path.abspath(__file__))
src = io.open(os.path.join(SP, "src", "ChainLab3D.glsl"), encoding="utf-8").read()

HEAD = r'''//@doc
 * @brief CHAIN SLICE 3D: the 3D chain laboratory without raymarching -- the
 * screen is a plane through a rolled 3D world (a space, a fold core and an end
 * body, the 3D lab's classes), every pixel one point sent once through the
 * chain of space transforms.  Up to eight planes behind each other (layerP):
 * the first that cuts matter is shown, the deeper ones through its holes, a
 * stack of cut plates.  Matter is coloured by a rolled 2D chain projected on
 * three planes of the folded point, air stays dim, the cut edges glow.  The
 * plane drifts through the world with the flight and turns between
 * orientations (across, along, diagonal, slowly turning) every few minutes.
 *
 * cutP >= 0.5: no world at all -- the plane cuts the implicit volume of the
 * 2D chain itself: (x, y) are the photo coordinates of the chain, its own
 * time the third axis, t = t0 + a x + b y with the tilt (a, b) from the
 * plane's orientation.  Untilted that is the 2D lab; tilted, every pixel
 * shows the chain at another moment -- never smeared, as the cut is
 * parametrised by (x, y) whatever its angle.  Costs what the 2D lab costs.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the drift through the world and the flow through the colour chain (integrated, jump-free)
 *   audioPhase      -> the folds turn, the colours wander (integrated)
 *   audioSpread     -> the bodies thicken, the colour chain distorts more
 *   audioKick       -> the rims flare (light)
 *   audioMode       -> the light and the palette: cool in minor, warm in major
 *   audioSwell      -> the fog glow and the colour saturation (slow)
 *
 * Knobs: cutP (world cut / space-time cut of the 2D chain), spaceP / coreP / bodyP (the 3D chain), layerP (1..8 planes),
 * solidP (the colour chain on three planes, or as a solid texture), reliefP
 * (the surfaces bulge with the colour chain's brightness), chainAP..chainDP
 * (the 2D colour chain), orderP, morphP, styleP (lit / glowing rims), speedP
 * (drift speed), detailP, paletteP, camP (the first plane orientation), hueP.
//@params spaceP coreP bodyP layerP cutP solidP reliefP chainAP chainBP chainCP chainDP orderP morphP styleP speedP detailP paletteP camP
//@audio audioSpread audioKick audioMode audioSwell
//@body
'''
i_body = src.index("//@body\n") + len("//@body\n")
body = src[i_body:]

SLICE = r'''
// ---- the slice ------------------------------------------------------------
// The world without the flight tube: a plane cuts it, nothing has to be carved.
float fieldS(vec3 p) { gDR = 1.0; return field3(p); }
vec3 normalS(vec3 p)
{
    const vec2 e = vec2(0.0015, -0.0015);
    vec3 n = e.xyy * fieldS(p + e.xyy) + e.yyx * fieldS(p + e.yyx) + e.yxy * fieldS(p + e.yxy) + e.xxx * fieldS(p + e.xxx);
    return normalize(n + vec3(1e-7));                       // deep inside a body the field can be flat
}
// Matter lit, air dim: the cut through a body is the subject.
float sliceShade(float d) { return mix(0.6, 1.25, smoothstep(0.03, -0.03, d)); }
// The plane normal per gaze (the app pans between gazes, clock only).
vec3 sliceAxis(float k, float time)
{
    float i = mod(k, 7.0);
    if (i > 5.5) return normalize(vec3(1.0, 1.0, 1.0));                               // diagonal: three-fold symmetry
    if (i > 4.5) return normalize(vec3(sin(0.013 * time), cos(0.013 * time), 0.35));  // slowly turning
    if (i > 3.5) return normalize(vec3(0.0, 1.0, 1.0));
    if (i > 2.5) return vec3(1.0, 0.0, 0.0);                                          // along the world's axis
    if (i > 1.5) return normalize(vec3(1.0, 1.0, 0.0));
    if (i > 0.5) return normalize(vec3(0.3, 0.2, 1.0));
    return vec3(0.0, 0.0, 1.0);                                                       // across the axis
}
// The space-time cut's point: the screen as the chain's (x, y), turning slowly
// in itself, and the chain's time tilted across it by the plane's orientation.
vec3 cutPoint(vec2 p, vec3 N, float z0)
{
    float a = 0.015 * sceneTime;
    vec2 u = (cos(a) * p + sin(a) * vec2(-p.y, p.x)) * 3.0;
    return vec3(u, z0 - dot(N.xy, u));
}
void sliceFrame(float cam, float time, out vec3 N, out vec3 X, out vec3 Y)
{
    float k0, k1, f;
    if (camHost > 0.5) {
        k0 = camGaze.x; k1 = camGaze.y; f = smoothstep(0.0, 1.0, camGaze.z);
    } else {
        float g = floor(clamp(cam, 0.0, 0.999) * 7.0) + 0.004 * time;
        k0 = floor(g); k1 = k0 + 1.0; f = smoothstep(0.75, 1.0, fract(g));
    }
    N = normalize(mix(sliceAxis(k0, time), sliceAxis(k1, time), f));
    vec3 x0 = normalize(cross(vec3(0.31, 0.83, 0.47), N)), y0 = cross(N, x0);   // never parallel to an axis above
    float a = 0.015 * time;                                 // a slow turn in the plane (one turn in 7 min)
    X = cos(a) * x0 + sin(a) * y0;
    Y = cos(a) * y0 - sin(a) * x0;
}
'''
k = body.index("vec2 chain(vec2 uv)")
body = body[:k] + SLICE.lstrip("\n") + body[k:]

m0 = body.index("void main()")
main = body[m0:]
a = main.index("    vec3 ro;"); b = main.index("    float t = 0.05;"); c = main.index("    vec3 lc = ")
CAM = r'''    vec3 ro;
    // The plane: its normal from the gaze, its depth the integrated flight along
    // the world's axis (the polar worlds stay in view), a little perspective so
    // the planes behind fan out.
    vec3 sN, sX, sY;
    sliceFrame(camP, sceneTime, sN, sX, sY);
    vec3 sc0 = vec3(0.0, 0.0, 0.25 * camFlight(gT));
    gCam = sc0 - vec3(0.0, 0.0, 6.0);                       // the Droste worlds centre on the plane
    vec3 rd = normalize(sN + (sX * p.x + sY * p.y) * 0.25);
    ro = sc0 + (sX * p.x + sY * p.y) * 3.0 - rd;
    vec3 sL = normalize(sX * 0.5 + sY * 0.7 - sN * 0.4);     // the light from the viewer's side of the plane
    vec3 cutFp = cutPoint(p, sN, sc0.z);
    if (cutP >= 0.5) {                                      // the space-time cut faces the viewer: no rims
        rd = vec3(0.0, 0.0, 1.0); ro = vec3(cutFp.xy, -1.0); sL = normalize(vec3(0.5, 0.7, -0.85));
    }
'''
CUT = r'''    float t = 0.05; float d = 1.0; bool hit = false; vec3 fp = vec3(0.0); float fdr = 1.0; float dHit = 0.0;
    int nl = 1 + int(clamp(layerP, 0.0, 1.0) * 7.99);      // 1..8 planes, the last one always shown
    float cutM = step(0.5, cutP);                           // 1: the space-time cut, no world
    if (cutM > 0.5) { hit = true; t = 1.0; fp = cutFp; dHit = -1.0; }
    else for (int i = 0; i < 8; ++i) {
        t = 1.0 + 1.2 * float(i);
        d = fieldS(ro + rd * t);
        if (d < 0.0 || i >= nl - 1) { hit = true; fp = gP; fdr = gDR; dHit = d; break; }
    }
'''
main = main[:a] + CAM + CUT + main[c:]
for old, new in (("        vec3 n = normal3(q);", "        vec3 n = cutM > 0.5 ? vec3(0.0, 0.0, -1.0) : normalS(q);"),
                 ("ao += (h - fieldD(q + n * h)) / h; }", "ao += (h - fieldS(q + n * h) + dHit) / h; }"),   # relative to the cut point: a cut runs through matter
                 ("        vec3 L = normalize(vec3(0.5, 0.7, -0.4));", "        vec3 L = sL;"),
                 ("        float diff = max(dot(n, L), 0.0);", "        float diff = 0.5 + 0.5 * dot(n, L);   // wrapped: a cut shows normals of every direction"),
                 ("        ao = clamp(1.0 - 0.4 * ao, 0.2, 1.0);", "        ao = clamp(1.0 - 0.4 * ao * (1.0 - cutM), 0.2, 1.0) * sliceShade(dHit);")):
    assert main.count(old) == 1, old
    main = main.replace(old, new)
assert "fieldD" not in main and "gazeDir" not in main
io.open(os.path.join(SP, "src", "ChainSlice3D.glsl"), "w", encoding="utf-8").write(HEAD + body[:m0] + main)
print("ok")
