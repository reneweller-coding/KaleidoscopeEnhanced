//@doc
 * @brief CONTOUR DYNAMICS PATCHES: patches of uniform vorticity with sharp edges -- elliptical vortices that spin
 * like Kirchhoff's ellipse and orbit each other, while the fluid at their rims, sheared by the neighbours, is
 * peeled off into long filaments that wind round them.  Each patch is filled with the photo (a cut of its own); the
 * filaments trail it into the background.  Slowly the patches gather themselves again.  An endless, periodic field.
 *
 * Audio Reactivity (structure, not only light):
 *   audioOnset      -> a patch is spun up (structure: it sheds more)
 *   audioSwell      -> the patches' strength
 *   audioAdvance    -> their orbits move on (integrated)
 *   audioKick       -> the rims flash (light)
 *
 * Knobs: patchesP (how many patches), aspectP (how elongated they are), gatherP (how fast they re-form), hueP.
//@params patchesP aspectP gatherP
//@audio audioSwell audioKick audioOnset
//@state 384 216 120 32
//@body
/**  A patch's centre, axes and spin angle at this moment: the patches orbit their neighbours slowly.
 *
 * @param i  The patch, 0..5. (in)
 *
 * @return
 *   Centre (xy, field units), the spin angle (z) and the strength (w).
 **/
vec4 patchAt(int i)
{
    float fi = float(i);
    float t = 0.03 * sceneTime + 0.01 * audioAdvance;
    vec2 c = vec2(0.3 + 0.28 * fi, 0.25 + 0.5 * mod(fi, 2.0));
    c += 0.12 * vec2(cos(t * (1.0 + 0.2 * fi) + fi), sin(t * (0.8 + 0.3 * fi) + 2.0 * fi));
    float strength = (0.7 + 0.6 * hash11(fi * 3.3)) * (mod(fi, 3.0) < 0.5 ? -1.0 : 1.0);
    float spin = 0.5 * sceneTime * strength + fi;
    return vec4(c, spin, strength);
}
/**  The flow of all patches at a point: rigid rotation inside an elliptical patch, a decaying swirl outside.
 *
 * @param x  The point in field units. (in)
 *
 * @return
 *   The velocity in field units per unit time.
 **/
vec2 patchFlow(vec2 x)
{
    int n = 3 + int(3.0 * clamp(patchesP, 0.0, 0.999));
    float asp = 1.0 + 1.5 * clamp(aspectP, 0.0, 1.0);
    vec2 v = vec2(0.0);
    for (int i = 0; i < 6; ++i) {
        if (i >= n) break;
        vec4 pa = patchAt(i);
        vec2 d = x - pa.xy;
        d -= vec2(1.7777778, 1.0) * floor(d / vec2(1.7777778, 1.0) + 0.5);
        vec2 q = rot2(-pa.z) * d * vec2(1.0, asp);              // the ellipse's own frame: a circle of radius R
        float R = 0.09, r = length(q);
        float w = pa.w * (0.6 + 0.8 * clamp(audioSwell, 0.0, 1.0));
        // rigid rotation inside, a point vortex's 1/r outside
        float mag = r < R ? r / R : R / r;
        v += w * mag * vec2(-d.y, d.x) / max(length(d), 1e-4) * 0.5;
    }
    return v;
}

/**  One step of the photo and the patch marker carried by the flow for this cell (the state pass): the marker is
 * drawn back toward the ideal patches slowly, so they gather themselves while their filaments trail away.
 *
 * @return
 *   The photo displacement (rg), the marker (b), 1.
 **/
vec4 stateStep()
{
    vec2 x = (vec2(stCell()) + 0.5) / stateRes.y;
    int n = 3 + int(3.0 * clamp(patchesP, 0.0, 0.999));
    float asp = 1.0 + 1.5 * clamp(aspectP, 0.0, 1.0);
    float ideal = 0.0;
    for (int i = 0; i < 6; ++i) {
        if (i >= n) break;
        vec4 pa = patchAt(i);
        vec2 d = x - pa.xy;
        d -= vec2(1.7777778, 1.0) * floor(d / vec2(1.7777778, 1.0) + 0.5);
        vec2 q = rot2(-pa.z) * d * vec2(1.0, asp);
        ideal = max(ideal, smoothstep(0.095, 0.085, length(q)) * (float(i) + 1.0) / 6.0);
    }
    if (stateFrame < 0.5) return vec4(0.0, 0.0, ideal, 1.0);
    vec2 v = patchFlow(x);
    // an onset spins up the flow near a patch: a short kick on the whole field's swirl
    float kick = clamp(audioOnset, 0.0, 1.0) > 0.6 ? 1.6 : 1.0;
    vec4 c = stCarry(v * 0.004 * stateRes.y * kick, 0.0008);
    c.b = mix(c.b, ideal, 0.002 + 0.01 * clamp(gatherP, 0.0, 1.0));
    return c;
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    vec2 cc = stView(p, 1.0);
    vec4 s = stLin(cc);
    vec2 uv = stUV(cc);
    float lod = stLod(cc, resolution.y / stateRes.y);
    vec3 back = imgLod(uv * 0.85 + 0.08, lod) * 0.35;
    float m = s.b;
    float id = floor(m * 6.0 + 0.5);
    vec3 inner = imgLod(uv * 1.3 + vec2(0.17, 0.31) * id, lod);
    vec3 tone = imgPalette(id / 6.0 + 0.03 * audioPhase);
    float w = smoothstep(0.05, 0.12, m);
    vec3 col = mix(back, mix(inner, inner * tone * 1.6, 0.3) * 1.1, w);
    float rim = smoothstep(0.02, 0.08, m) * (1.0 - smoothstep(0.1, 0.16, m));
    col += mix(tone, vec3(1.0), 0.5) * rim * (0.2 + 0.6 * clamp(audioKick, 0.0, 1.0));
    finish(col);
}
