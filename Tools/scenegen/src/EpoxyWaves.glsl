//@doc
 * @brief EPOXY WAVES: resin-art ocean -- the classic poured-epoxy seascape
 * seen from above: bands of deep blue, teal and turquoise resin with
 * white lacy "foam" cells along the wave fronts, the waves slowly
 * washing in over a sandy shore made of the photograph, retreating and
 * washing in again, the lacing reforming each time.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the waves wash in and out (integrated, jump-free)
 *   audioSpread     -> how far the waves reach
 *   audioKick       -> the foam brightens (light)
 *   audioMode       -> the sea: deep blue in minor, tropical turquoise in major
 *   audioRoughness  -> the lacing gets finer
 *   audioSwell      -> the glossy sheen (slow)
 *
 * Knobs: bandP (wave bands), laceP (lacing density), shoreP (photo shore), hueP.
//@params bandP laceP shoreP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    // The shore line runs diagonally, wavy; the sea on one side (repeating so the plane is endless).
    float s = dot(p, normalize(vec2(0.8, 0.6))) + 0.12 * fbm3(p * 2.0);
    float T = 0.15 * sceneTime + 1.0 * audioAdvance;
    float wash = (0.12 + 0.12 * clamp(audioSpread, 0.0, 1.0)) * sin(T);
    float x = mod(s + wash + 1.0, 2.0) - 1.0;                   // -1..1, the shore at 0
    vec2 uv = p * 0.5 + 0.5;
    vec3 sand = mix(vec3(0.9, 0.82, 0.65), imgLod(uv, 1.5) * 1.1, clamp(shoreP, 0.0, 1.0) * 0.7);
    vec3 deep = mix(vec3(0.02, 0.1, 0.35), vec3(0.0, 0.25, 0.4), mode);
    vec3 mid = mix(vec3(0.05, 0.35, 0.6), vec3(0.0, 0.55, 0.6), mode);
    vec3 shal = mix(vec3(0.3, 0.7, 0.8), vec3(0.4, 0.9, 0.85), mode);
    vec3 col;
    if (x > 0.0) col = sand;
    else {
        float dz = -x;                                          // depth into the sea
        float nb = 2.0 + 3.0 * clamp(bandP, 0.0, 1.0);
        float band = dz * nb + 0.2 * fbm3(p * 3.0 + T * 0.2);
        col = mix(shal, mid, smoothstep(0.2, 0.6, band));
        col = mix(col, deep, smoothstep(0.8, 1.6, band));
        // Cells (lacing) at each band edge: resin cells as a Voronoi lace.
        vec2 lq = p * (35.0 + 30.0 * rough);
        vec2 li = floor(lq), lf = fract(lq);
        float f1 = 9.0, f2 = 9.0;
        for (int y = -1; y <= 1; ++y) for (int xx = -1; xx <= 1; ++xx) {
            vec2 o = vec2(xx, y);
            vec2 c = o + 0.1 + 0.8 * hash22(li + o);
            float d = length(lf - c);
            if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
        }
        float laceLine = smoothstep(0.14, 0.04, f2 - f1);
        float front = exp(-pow((fract(band) - 0.1) * 5.0, 2.0)) * step(band, 2.0);
        float foamEdge = exp(-dz * 14.0);                       // the surf line at the shore
        float lace = laceLine * clamp(front * (0.4 + 0.6 * clamp(laceP, 0.0, 1.0)) + foamEdge, 0.0, 1.0);
        col = mix(col, vec3(0.95, 0.97, 1.0) * (1.0 + 0.4 * kick), lace);
        col = mix(col, vec3(0.95, 0.97, 1.0), foamEdge * 0.6);
    }
    // Wet sand darkens just above the waterline.
    col *= 1.0 - 0.3 * smoothstep(0.15, 0.0, x) * step(0.0, x);
    // Glossy resin sheen.
    col += vec3(1.0) * pow(max(0.0, fbm3(p * 1.2 + 7.0) - 0.4), 3.0) * (0.2 + 0.5 * swell);
    col = mix(col, col * glowColour(imgLod(uv, 6.0), p, hueP * 0.159) * 1.2, 0.05);
    finish(col);
}
