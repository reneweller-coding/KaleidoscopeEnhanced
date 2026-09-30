//@doc
 * @brief TEXTURE MICROSCOPE SLIDE: panning across a fluorescence-stained
 * tissue section under the microscope -- a dense carpet of cells, their
 * nuclei glowing blue, the cell bodies and membranes in green and red,
 * fibres threading between them in a third colour; the tissue's layout
 * follows the photograph (its dark and light regions become different
 * tissue densities), and the focus breathes slowly, bringing layers in and
 * out of sharpness.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the slide pans (integrated, jump-free)
 *   audioSpread     -> cell density
 *   audioKick       -> the stain glows brighter (light)
 *   audioMode       -> stain: fluorescence in minor, H&E (pink/purple on white) in major (blended)
 *   audioRoughness  -> the fibres
 *   audioSwell      -> the focus breathes deeper (slow)
 *
 * Knobs: cellP (cell size), fibreP (fibre amount), focusP (base focus), hueP.
//@params cellP fibreP focusP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = smoothstep(0.2, 0.8, clamp(audioMode, 0.0, 1.0));
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec2 pan = vec2(0.01, 0.004) * sceneTime + vec2(0.06, 0.02) * audioAdvance;
    vec2 w = p + pan;
    vec2 uv = w * 0.5 + 0.5;
    float tissue = luma(imgLod(uv, 4.0));
    float dens = 0.4 + 0.5 * tissue + 0.3 * clamp(audioSpread, 0.0, 1.0);
    // Focus: blur the cell edges as the focus breathes.
    float blur = clamp(0.3 * (1.0 - clamp(focusP, 0.0, 1.0)) + (0.15 + 0.3 * swell) * (0.5 + 0.5 * sin(0.15 * sceneTime + 2.0 * fbm3(w))), 0.02, 0.6);
    float S = 12.0 + 14.0 * (1.0 - clamp(cellP, 0.0, 1.0));
    vec2 x = w * S + 0.4 * vec2(fbm3(w * 3.0), fbm3(w * 3.0 + 5.0));
    vec2 i = floor(x), f = fract(x);
    float d1 = 9.0, d2 = 9.0; vec2 id = i; vec2 toC = vec2(0.0);
    for (int y = -1; y <= 1; ++y) for (int xx = -1; xx <= 1; ++xx) {
        vec2 o = vec2(xx, y);
        vec2 c = o + 0.15 + 0.7 * hash22(i + o);
        float d = length(f - c);
        if (d < d1) { d2 = d1; d1 = d; id = i + o; toC = f - c; } else if (d < d2) d2 = d;
    }
    float present = step(hash21(id + 7.0), dens);
    float membrane = exp(-(d2 - d1) / (0.04 + blur * 0.3)) * present;
    float nr = 0.18 + 0.1 * hash21(id + 2.0);
    vec2 ne = toC * vec2(1.0, 1.0 + 0.4 * hash21(id + 3.0));
    float nucleus = smoothstep(nr + blur * 0.3, nr - 0.02, length(ne)) * present;
    float cyto = smoothstep(0.1, 0.4, d2 - d1) * present;
    // Fibres: thin wavy lines across.
    float fb = abs(sin(dot(w, vec2(12.0, 30.0)) + 6.0 * fbm3(w * 2.0))) ;
    float fibre = exp(-fb / (0.03 + blur * 0.1)) * (0.2 + 0.8 * clamp(fibreP, 0.0, 1.0)) * (0.4 + 0.6 * rough) * (1.0 - tissue * 0.5);
    // Fluorescence on black.
    vec3 fl = vec3(0.0);
    fl += vec3(0.15, 0.35, 1.0) * nucleus * (0.7 + 0.3 * hash21(id + 4.0));
    fl += vec3(0.2, 0.9, 0.3) * cyto * 0.18 * (0.6 + 0.8 * hash21(id + 5.0));
    fl += vec3(1.0, 0.25, 0.2) * membrane * 0.5;
    fl += vec3(0.9, 0.2, 0.8) * fibre * 0.4;
    fl *= 1.0 + 0.8 * kick;
    fl = mix(fl, fl * glowColour(imgLod(uv, 6.0), w, hueP * 0.159) * 1.4, 0.15);
    // H&E on white.
    vec3 he = vec3(0.96, 0.93, 0.95);
    he = mix(he, vec3(0.93, 0.6, 0.75), cyto * 0.7);
    he = mix(he, vec3(0.8, 0.45, 0.65), membrane * 0.6);
    he = mix(he, vec3(0.35, 0.2, 0.55), nucleus * 0.9);
    he = mix(he, vec3(0.9, 0.5, 0.6), fibre * 0.6);
    finish(mix(fl, he, mode));
}
