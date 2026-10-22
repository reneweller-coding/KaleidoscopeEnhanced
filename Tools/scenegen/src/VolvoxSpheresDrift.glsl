//@doc
 * @brief VOLVOX SPHERES DRIFT: a field of green Volvox colonies drifting at many depths, each a clear turning sphere
 * studded with tiny cells, carrying daughter spheres inside it and granddaughters inside those; over each phrase the
 * daughters divide in two and close up again.  A sphere is seen as a disc whose surface points are turned by its spin;
 * its cells are a latitude-longitude grid of dots on the turned surface, its rim glows like a thin shell; the daughters
 * circle inside it and split along their own axis as the phrase goes on.  The spheres are drawn far to near, each a
 * little clear.  The green is pulled a little toward the photo's hue.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance   -> the spheres turn and drift (integrated)
 *   audioPhrasePos -> the daughters divide in two over each phrase and close up again
 *   audioSwell     -> the colonies' glow
 *
 * Knobs: sphereP (how many spheres), cellP (how fine the surface cells are), hueP.
//@params sphereP cellP
//@audio audioPhrasePos audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float N = floor(8.0 + 4.0 * clamp(sphereP, 0.0, 1.0));
    float cells = 8.0 + 6.0 * clamp(cellP, 0.0, 1.0);
    float spin = 0.06 * sceneTime + 0.25 * audioAdvance;
    float drift = 0.02 * sceneTime + 0.08 * audioAdvance;
    float split = 0.5 - 0.5 * cos(6.2831853 * clamp(audioPhrasePos, 0.0, 1.0));
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float gh = fract(0.33 + 0.25 * (fract(fh - 0.33 + 0.5) - 0.5));
    vec3 col = famCol(gh, 0.45) * 0.02;
    for (int i = 0; i < 12; ++i) {
        float fi = float(i);
        if (fi >= N) break;
        float near = (fi + 1.0) / N;                                 // far to near
        float R = 0.09 + 0.24 * near * near;
        vec2 c = vec2(1.6 * (fract(fi * 0.7548777 + 0.3) - 0.5), 0.9 * (fract(fi * 0.5698403 + 0.1) - 0.5));
        c += vec2(0.1 * sin(drift * (0.6 + 0.2 * near) + 2.0 * fi), 0.06 * cos(drift * 0.7 + 3.0 * fi));
        vec2 q = (p - c) / R;
        float r = length(q);
        if (r > 1.05) continue;
        float z = sqrt(max(1.0 - r * r, 0.0));
        vec3 n = vec3(q, z);
        float sp = spin * (0.7 + 0.5 * fract(fi * 0.37)) + fi;
        n.xz = rot2(sp) * n.xz;
        float lat = asin(clamp(n.y, -1.0, 1.0)), lon = atan(n.z, n.x);
        vec2 cg = vec2(lon / 6.2831853 * cells * 2.0, lat / 3.14159265 * cells);
        float dots = smoothstep(0.32, 0.18, length(fract(cg) - 0.5));
        float rim = pow(1.0 - z, 2.0);
        vec3 sc = famCol(gh, 0.5) * (0.06 + 0.5 * rim + 0.35 * dots * (0.4 + 0.6 * z));
        // the daughters circle inside, each splitting in two over the phrase; a granddaughter glows inside each half
        for (int k = 0; k < 4; ++k) {
            float fk = float(k);
            float ak = sp * 0.7 + 1.5707963 * fk;
            vec2 dc = 0.45 * vec2(cos(ak), 0.8 * sin(ak));
            vec2 ax = vec2(-sin(ak), cos(ak));
            for (int s = 0; s < 2; ++s) {
                vec2 hc = dc + (float(s) - 0.5) * 0.24 * split * ax;
                float dd = length(q - hc) / (0.2 - 0.05 * split);
                sc += famCol(gh, 0.6) * (smoothstep(1.0, 0.85, dd) * 0.25 + exp(-pow((dd - 0.9) / 0.1, 2.0)) * 0.3);
                sc += famLight(gh, 0.5, 0.4) * exp(-dd * dd / 0.05) * 0.5;
            }
        }
        float alpha = smoothstep(1.02, 0.96, r) * (0.45 + 0.4 * near);
        col = mix(col, sc * glow * (0.5 + 0.6 * near), alpha);
    }
    finish(col);
}
