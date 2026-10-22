//@doc
 * @brief TRICORN GLOW FILAMENTS: the filaments of the Burning Ship and the Tricorn -- z <- (|x| + i|y|)^2 + c and
 * z <- conj(z)^2 + c -- as threads of light: the exterior distance 0.5 |z| log |z| / |z'| turns the escape into a
 * thin glow round every filament, while the sets' bodies stay dark.  The view travels along the Burning Ship's
 * antenna on the negative real axis, where little ships hang in the threads (or along the Tricorn's left spike),
 * zooming in and out as it goes.  One
 * colour family from the photo, the threads shaded by how long the point took to escape.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance       -> the travel and the zoom (integrated: the zoom swings in and out)
 *   audioRoughness     -> the escape radius: rough sound thickens the threads' sheaths
 *   audioSectionId/Age -> every new section crosses over between the Burning Ship and the Tricorn, over six seconds
 *
 * Knobs: zoomP (how deep the zoom swings), threadP (the threads' width), hueP.  Distinct from the fractal zooms,
 * which fill their areas.
//@params zoomP threadP
//@audio audioRoughness audioSectionId audioSectionPrev audioSectionAge
//@body
/**  The exterior distance to the Burning Ship (kind 0) or the Tricorn (kind 1).
 *
 * @param c     The parameter. (in)
 * @param kind  0 or 1. (in)
 * @param R     The escape radius. (in)
 * @param n     Returns the smooth escape count. (out)
 *
 * @return
 *   The distance estimate (0 inside).
 **/
float shipDist(vec2 c, float kind, float R, out float n)
{
    vec2 z = vec2(0.0);
    float dz = 0.0;
    n = 0.0;
    for (int i = 0; i < 90; ++i) {
        dz = 2.0 * length(z) * dz + 1.0;
        if (kind < 0.5) {
            vec2 a = abs(z);
            z = vec2(a.x * a.x - a.y * a.y, 2.0 * a.x * a.y) + c;
        } else {
            z = vec2(z.x * z.x - z.y * z.y, -2.0 * z.x * z.y) + c;
        }
        float r2 = dot(z, z);
        if (r2 > R * R) {
            float r = sqrt(r2);
            n = float(i) - log2(log(r) / log(R));
            return 0.5 * r * log(r) / dz;
        }
    }
    n = 90.0;
    return 0.0;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float R = 4.0 + 28.0 * clamp(audioRoughness, 0.0, 1.0);
    float kind = mix(mod(max(audioSectionPrev, 0.0), 2.0), mod(max(audioSectionId, 0.0), 2.0),
                     smoothstep(0.0, 6.0, audioSectionAge));
    float travel = 0.02 * sceneTime + 0.08 * audioAdvance;
    float swing = 0.5 - 0.5 * cos(0.7 * travel);
    float zoom = 0.07 * exp(-swing * (1.2 + 1.5 * clamp(zoomP, 0.0, 1.0)));
    // along the antenna: c from -1.6 to -1.95 and back, the Burning Ship drawn upside down (its usual view)
    vec2 centre = vec2(-1.765 + 0.03 * sin(0.43 * travel), -0.012 + 0.008 * sin(0.9 * travel + 1.0));
    float thread = 1.2 + 1.8 * clamp(threadP, 0.0, 1.0);
    vec3 col = vec3(0.0);
    for (int k = 0; k < 2; ++k) {
        float wk = k == 0 ? 1.0 - kind : kind;
        if (wk < 0.01) continue;
        // the Burning Ship along its antenna (drawn upside down, its usual view); the Tricorn along its left spike
        float zk = k == 0 ? zoom : 1.7 * zoom;
        vec2 ck = k == 0 ? centre + vec2(p.x, -p.y) * zk
                         : vec2(-1.37 + 0.05 * sin(0.43 * travel + 1.0), 0.02 * sin(0.7 * travel)) + p * zk;
        float w = thread * zk / resolution.y;
        float n;
        float d = shipDist(ck, float(k), R, n);
        float g = exp(-d / w) * step(1e-9, d);
        float halo = exp(-d / (w * 30.0)) * 0.35 * step(1e-9, d);
        col += wk * famLight(fh, fract(n / 40.0), 0.3 * g) * (g + halo);
    }
    col += famCol(fh, 0.5) * 0.012;
    finish(col);
}
