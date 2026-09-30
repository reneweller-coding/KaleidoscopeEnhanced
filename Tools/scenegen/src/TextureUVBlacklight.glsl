//@doc
 * @brief TEXTURE UV BLACKLIGHT: the photograph under a black light -- the
 * picture itself sinks into a deep violet dark, while fluorescent paint
 * glows on it: contour lines of the photo's brightness, drawn in neon pink,
 * acid green, orange and cyan, creep slowly across the picture as their
 * levels rise and fall (like a psychedelic black-light poster that keeps
 * redrawing itself), the brightest parts of the photo fluoresce blue-white,
 * and specks of fluorescent lint float in the air.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the contour levels creep (integrated, jump-free)
 *   audioSpread     -> how many contour lines glow
 *   audioKick       -> the paint flares (light)
 *   audioHigh       -> the floating lint sparkles (light)
 *   audioMode       -> palette: cool (cyan/violet/green) in minor, hot (pink/orange/yellow) in major
 *   audioSwell      -> the photo's own fluorescence (slow)
 *
 * Knobs: lineP (line width), detailP (how detailed the contours are), lintP, hueP.
//@params lineP detailP lintP
//@audio audioSpread audioKick audioHigh audioMode audioSwell
//@body
vec3 uvNeon(float k, float mode)
{
    vec3 hot[4]; vec3 cold[4];
    hot[0] = vec3(1.0, 0.1, 0.6); hot[1] = vec3(1.0, 0.5, 0.05); hot[2] = vec3(0.95, 1.0, 0.1); hot[3] = vec3(0.3, 1.0, 0.2);
    cold[0] = vec3(0.1, 0.9, 1.0); cold[1] = vec3(0.6, 0.2, 1.0); cold[2] = vec3(0.3, 1.0, 0.3); cold[3] = vec3(1.0, 0.2, 0.8);
    int i = int(mod(k, 4.0));
    vec3 a = hot[0], b = cold[0];
    if (i == 1) { a = hot[1]; b = cold[1]; } else if (i == 2) { a = hot[2]; b = cold[2]; } else if (i == 3) { a = hot[3]; b = cold[3]; }
    return mix(b, a, mode);
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec2 uv = p * 0.75 + 0.5 + vec2(0.005, 0.003) * sceneTime;
    vec3 ph = imgLod(uv, 0.5);
    float lodC = 5.0 - 1.8 * clamp(detailP, 0.0, 1.0);
    float l = luma(imgLod(uv, lodC)) + 0.08 * (fbm3(p * 2.0 + 0.02 * sceneTime) - 0.5);
    float e = exp2(lodC) / 1024.0;
    vec2 gl = vec2(luma(imgLod(uv + vec2(e, 0.0), lodC)) - luma(imgLod(uv - vec2(e, 0.0), lodC)),
                   luma(imgLod(uv + vec2(0.0, e), lodC)) - luma(imgLod(uv - vec2(0.0, e), lodC))) / (2.0 * e) * 0.75;
    float gpx = length(gl) / resolution.y + 1e-4;              // luma change per pixel
    // The picture under UV: deep violet.
    vec3 col = vec3(0.09, 0.03, 0.2) * luma(ph) * 1.4 + vec3(0.02, 0.0, 0.05);
    // Fluorescent whites.
    col += vec3(0.55, 0.65, 1.0) * smoothstep(0.55, 0.95, luma(ph)) * (1.0 - satOf(ph)) * (0.25 + 0.5 * swell);
    // Neon contour lines, their levels creeping.
    float nL = 2.5 + 3.5 * clamp(audioSpread, 0.0, 1.0);
    float lv = l * nL + 0.15 * sceneTime + 1.2 * audioAdvance;
    float k = floor(lv + 0.5);                                   // nearest level (in space, not time)
    float dl = abs(lv - k) / nL;                                 // luma distance to it
    float dpx = dl / gpx;                                        // in pixels
    float w = 1.2 + 3.0 * clamp(lineP, 0.0, 1.0);
    vec3 nc = mix(uvNeon(k, mode), glowColour(imgLod(uv, 6.0), p, hueP * 0.159), 0.15);
    float line = smoothstep(w + 1.0, w - 1.0, dpx);
    float halo = exp(-dpx / (w * 4.0));
    col += nc * (line * 1.3 + halo * 0.35) * (0.8 + 0.8 * kick);
    col = mix(col, nc * 1.6 + 0.3, line * 0.35);
    // Floating fluorescent lint: round soft specks drifting.
    for (int L = 0; L < 2; ++L) {
        float fl = float(L);
        vec2 g = p * (9.0 + 6.0 * fl) + vec2(0.1 * sceneTime, -0.06 * sceneTime) * (1.0 + fl) + fl * 5.0;
        vec2 gi = floor(g), gf = fract(g);
        vec2 c = 0.2 + 0.6 * hash22(gi + fl * 3.0);
        float on = step(hash21(gi + 9.0 + fl), 0.2 + 0.5 * clamp(lintP, 0.0, 1.0));
        float d = length(gf - c);
        float tw = 0.4 + 0.6 * sin(sceneTime * (1.0 + hash21(gi)) + hash21(gi + 1.0) * 6.28);
        col += on * uvNeon(floor(hash21(gi + 4.0) * 4.0), mode) * (smoothstep(0.06, 0.01, d) * 0.9 + exp(-d * 14.0) * 0.2) * (0.3 + 0.7 * hi) * tw;
    }
    finish(col);
}
