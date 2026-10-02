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
 * (The space-time cut of the 2D chain itself lives in the 2D chain labs as tiltP.)
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the drift through the world and the flow through the colour chain (integrated, jump-free)
 *   audioPhase      -> the folds turn, the colours wander (integrated)
 *   audioSpread     -> the bodies thicken, the colour chain distorts more
 *   audioKick       -> the rims flare (light)
 *   audioMode       -> the light and the palette: cool in minor, warm in major
 *   audioSwell      -> the fog glow and the colour saturation (slow)
 *
 * Knobs: spaceP / coreP / bodyP (the 3D chain), layerP (1..8 planes), hyperP (the plane
 * at rest, the world's own time running: a cut through 4D),
 * solidP (the colour chain on three planes, or as a solid texture), reliefP
 * (the surfaces bulge with the colour chain's brightness), chainAP..chainDP
 * (the 2D colour chain), orderP, morphP, styleP (lit / glowing rims), speedP
 * (drift speed), detailP, paletteP, camP (the first plane orientation), hueP,
 * isoP (contour lines of the distance field: the air around the bodies drawn
 * like a map's height lines, running slowly outward; none below ~0.35).
//@params spaceP coreP bodyP layerP hyperP isoP solidP reliefP chainAP chainBP chainCP chainDP orderP morphP styleP speedP detailP paletteP camP
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
// Matter lit, air dimmer: the cut through a body is the subject.  The edge one
// pixel wide (px: a pixel in the world) -- crisp, but not stair-stepped.  Air
// glows near matter (a halo ~25 px wide): a world cut into thin splinters
// stays readable and does not fall dark.
float sliceShade(float d, float px)
{
    float halo = exp(-max(d, 0.0) / (25.0 * px));
    return mix(0.8 + 0.45 * halo, 1.7, smoothstep(px, -px, d));   // a cut is lit flat-on: brighter than a surface
}
// How close the view comes per fold core: the finer it folds (its scale per
// round to the power of its rounds; the inversion folds count as fine), the
// closer -- a Menger sponge (3^3) seen at a third of the plain lattice's view.
float sliceZoom(int kc)
{
    if (kc == 5) return 0.35;                                   // Menger sponge (27)
    if (kc == 6 || kc == 11 || kc == 12 || kc == 15) return 0.42;   // Kleinian, pseudo-Kleinian, kaliset, Apollonian
    if (kc == 17 || kc == 19) return 0.48;                      // cross-Menger (14), mixed Sierpinski (10)
    if (kc == 13 || kc == 14 || kc == 20 || kc == 7 || kc == 16) return 0.58;   // scale 2 KIFS (8), icosahedral (7), Mandelbulb
    if (kc == 1 || kc == 2 || kc == 21 || kc == 9) return 0.75; // tetra / octa KIFS (4-5), hyperbolic honeycomb
    if (kc == 10 || kc == 18) return 0.9;                       // amazing surface, Mandalay box (2-3)
    return 1.1;                                                 // no core, plane folds, sphere-inversion box, polyhedral kaleidoscope
}
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
COLMIX = "        col = mix(fogC, sc, exp(-t * (0.06 + 0.04 * swell)));"
# isoP: the distance field's contour lines, after the colour of the cut point
ISO = r'''
        // isoP: the distance field's contour lines -- around every body its
        // height lines, like a map; every fourth stronger, all running slowly
        // outward (clock, never audio: the kick only brightens them).  Their
        // width is a pixel in the world (sPx), not fwidth: the cut loop
        // branches per pixel.  They fade with the distance from matter.
        float iso = smoothstep(0.35, 0.75, isoP);
        if (iso > 0.0) {
            float isoW = 0.05 * sView;
            float isoU = dHit / isoW - 0.12 * sceneTime;
            float isoF = abs(fract(isoU + 0.5) - 0.5) * isoW;  // to the nearest line, in the world
            float isoPx = sPx * max(1.0, resolution.y / 900.0);   // a pixel at 900 lines: the same lines on a big screen
            float isoL = 1.0 - smoothstep(0.4 * isoPx, 1.1 * isoPx, isoF);   // thin: where the field is shallow they widen
            float isoM = abs(mod(floor(isoU + 0.5), 4.0)) < 0.5 ? 1.0 : 0.3;
            float air = smoothstep(0.0, 2.0 * sPx, dHit);
            float fade = exp(-abs(dHit) / (0.9 * sView)) * mix(0.45, 1.0, air);   // on a cut face fainter
            col *= 1.0 - 0.3 * iso * air;                     // the air between the lines darker: the map reads
            col += iso * isoL * isoM * fade * rimC * (0.9 + 0.8 * kick);
        }'''
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
    // hyperP: a cut through 4D -- the world is a function of time (its folds turn,
    // its classes breathe); with the plane nearly at rest and the world's time
    // running faster, the shapes grow, split and merge in place.
    float hyp = smoothstep(0.3, 0.9, hyperP);
    vec3 sc0 = vec3(0.0, 0.0, 0.25 * camFlight(gT) * (1.0 - 0.85 * hyp));
    gT += hyp * 0.6 * sceneTime;
    gRot += hyp * 0.03 * sceneTime;
    // The view height follows the fold core (sliceZoom), gliding through a core fade.
    vec3 wcore = (walkHost > 0.5 && walkAll()) ? walkCore : vec3(coreP, coreP, 0.0);
    float sView = 3.0 * mix(sliceZoom(ordco(pickStage(wcore.x, 22))), sliceZoom(ordco(pickStage(wcore.y, 22))),
                            smoothstep(0.0, 1.0, wcore.z));
    float sDz = 0.4 * sView;                                // the planes' spacing goes with the view
    float sPx = sView / resolution.y;                       // one pixel in the world
    gCam = sc0 - vec3(0.0, 0.0, 6.0);                       // the Droste worlds centre on the plane
    vec3 rd = normalize(sN + (sX * p.x + sY * p.y) * 0.25);
    ro = sc0 + (sX * p.x + sY * p.y) * sView - rd;
    vec3 sL = normalize(sX * 0.5 + sY * 0.7 - sN * 0.4);     // the light from the viewer's side of the plane
'''
CUT = r'''    float t = 0.05; float d = 1.0; bool hit = false; vec3 fp = vec3(0.0); float fdr = 1.0; float dHit = 0.0;
    int nl = 1 + int(clamp(layerP, 0.0, 1.0) * 7.99);      // 1..8 planes, the last one always shown
    for (int i = 0; i < 8; ++i) {
        t = 1.0 + sDz * float(i);
        d = fieldS(ro + rd * t);
        if (d < 0.0 || i >= nl - 1) { hit = true; fp = gP; fdr = gDR; dHit = d; break; }
    }
'''
main = main[:a] + CAM + CUT + main[c:]
for old, new in (("        vec3 n = normal3(q);", "        vec3 n = normalS(q);"),
                 ("ao += (h - fieldD(q + n * h)) / h; }", "ao += (h - fieldS(q + n * h) + dHit) / h; }"),   # relative to the cut point: a cut runs through matter
                 ("        vec3 L = normalize(vec3(0.5, 0.7, -0.4));", "        vec3 L = sL;"),
                 ("        float diff = max(dot(n, L), 0.0);", "        float diff = 0.5 + 0.5 * dot(n, L);   // wrapped: a cut shows normals of every direction"),
                 ("        ao = clamp(1.0 - 0.4 * ao, 0.2, 1.0);", "        ao = clamp(1.0 - 0.4 * ao, 0.2, 1.0) * sliceShade(dHit, sPx);"),
                 (COLMIX, COLMIX + ISO)):
    assert main.count(old) == 1, old
    main = main.replace(old, new)
assert "fieldD" not in main and "gazeDir" not in main
io.open(os.path.join(SP, "src", "ChainSlice3D.glsl"), "w", encoding="utf-8").write(HEAD + body[:m0] + main)
print("ok")
