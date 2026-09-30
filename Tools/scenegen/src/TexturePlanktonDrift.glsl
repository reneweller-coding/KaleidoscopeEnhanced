//@doc
 * @brief TEXTURE PLANKTON DRIFT: a dark-field microscope view of drifting
 * plankton -- glassy diatoms (discs and needles),
 * radiolarian spheres with spiny halos and tiny copepods glide through
 * the view at different depths, glowing against black in dark-field
 * light, their colours tinted by the photograph; out-of-focus ones blur
 * into soft shapes.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the drift (integrated, jump-free)
 *   audioSpread     -> the number of organisms
 *   audioKick       -> the organisms flash (light)
 *   audioMode       -> the light: cool blue in minor, golden in major
 *   audioRoughness  -> the spines grow
 *   audioSwell      -> depth of field (slow)
 *
 * Knobs: sizeP (organism size), kindP (mix of kinds), photoP (photo tint), hueP.
//@params sizeP kindP photoP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec3 lc = mix(vec3(0.6, 0.8, 1.0), vec3(1.0, 0.85, 0.55), mode);
    vec3 col = vec3(0.005, 0.008, 0.015);
    float T = 0.05 * sceneTime + 0.35 * audioAdvance;
    for (int L = 0; L < 3; ++L) {
        float fl = float(L);                                    // focal plane 1 is sharp
        float S = (2.5 + 2.0 * fl) * (1.3 - 0.6 * clamp(sizeP, 0.0, 1.0));
        vec2 g = p * S + vec2(T * (1.0 + 0.3 * fl), 0.3 * T * (fl - 1.0)) + fl * 9.0;
        vec2 gi = floor(g);
        float blur = abs(fl - 1.0) * (0.04 + 0.1 * swell);
        for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
            vec2 id = gi + vec2(i, j);
            float h = hash21(id + fl * 5.0);
            if (h > 0.2 + 0.4 * clamp(audioSpread, 0.0, 1.0)) continue;
            vec2 c = id + 0.5 + 0.25 * (hash22(id + fl) - 0.5);
            float rot = T * (h - 0.5) * 2.0 + h * 6.28;
            vec2 l = rot2(rot) * (g - c);
            float kind = floor(fract(h * 7.0 + clamp(kindP, 0.0, 1.0)) * 3.0);   // disc, needle, radiolarian
            float edge; float fill;
            float R = 0.17 + 0.07 * hash21(id + 3.0);
            float w = 0.02 + blur;
            if (kind < 0.5) {
                // Centric diatom: disc with radial ribs.
                float r = length(l);
                float ribs = 0.5 + 0.5 * cos(atan(l.y, l.x) * 24.0);
                edge = exp(-abs(r - R) / w) + 0.3 * smoothstep(R, R * 0.2, r) * ribs * exp(-blur * 20.0);
                fill = smoothstep(R + w, R - w, r) * 0.15;
            } else if (kind < 1.5) {
                // Pennate diatom: long needle.
                float d = length(vec2(max(abs(l.x) - R * 1.4, 0.0), l.y)) - R * 0.15;
                edge = exp(-abs(d) / w);
                fill = smoothstep(w, -w, d) * 0.2;
            } else if (kind < 2.5) {
                // Radiolarian: sphere with spines.
                float r = length(l);
                float a = atan(l.y, l.x);
                float sp = pow(max(0.0, 0.5 + 0.5 * cos(a * 16.0)), 20.0) * smoothstep(R * (1.5 + 0.6 * rough), R, r) * step(R, r);
                edge = exp(-abs(r - R * 0.8) / w) + sp * 0.8 + 0.4 * exp(-abs(r - R * 0.5) / w);
                fill = smoothstep(R * 0.8 + w, R * 0.8 - w, r) * 0.1;
            }
            vec3 oc = mix(lc, glowColour(imgLod(hash22(id + 7.0), 4.0), id, hueP * 0.159), clamp(photoP, 0.0, 1.0) * 0.6);
            // Everything must end inside the 3x3 search (else it is cut at the cell borders).
            float win = smoothstep(1.0, 0.8, length(g - c));
            float I = (edge * 0.8 + fill) * win * (1.0 - 0.3 * abs(fl - 1.0)) * (0.8 + 0.8 * kick);
            col += oc * I;
        }
    }
    finish(col);
}
