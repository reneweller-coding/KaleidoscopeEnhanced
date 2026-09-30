//@doc
 * @brief CONCENTRIC PHOTO: the photograph drawn with concentric rings -- a
 * field of ring systems whose rings swell where the picture is dark and
 * thin where it is light, so the image emerges from rippling circles like
 * a halftone made of ripples; the ring centres drift, the rings flow
 * outward, and where two systems overlap they make moire.  Endless,
 * mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the rings flow outward (integrated, jump-free)
 *   audioSpread     -> ring spacing
 *   audioKick       -> the rings brighten (light)
 *   audioMode       -> dark rings on light in major, light rings on dark in minor (blend)
 *   audioRoughness  -> the rings wobble
 *   audioSwell      -> the photo's colour in the rings (slow)
 *
 * Knobs: centreP (number of ring centres), contrastP, zoomP (photo scale), hueP.
//@params centreP contrastP zoomP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = smoothstep(0.3, 0.7, clamp(audioMode, 0.0, 1.0));
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float z = 0.4 + 0.5 * clamp(zoomP, 0.0, 1.0);
    vec2 uv = p * z + 0.5 + vec2(0.003, 0.002) * sceneTime;
    vec3 ph = imgLod(uv, 1.5);
    float dark = 1.0 - luma(ph);
    float con = 0.6 + 0.8 * clamp(contrastP, 0.0, 1.0);
    dark = clamp((dark - 0.5) * con + 0.5, 0.0, 1.0);
    float T = 0.1 * sceneTime + 0.7 * audioAdvance;
    float N = 60.0 + 60.0 * (1.0 - clamp(audioSpread, 0.0, 1.0));
    // Ring phase: from the nearest of a few drifting centres (smooth blend of distances).
    float nC = 1.0 + 3.0 * clamp(centreP, 0.0, 1.0);
    float wsum = 0.0, rsum = 0.0;
    for (int i = 0; i < 4; ++i) {
        float fi = float(i);
        float on = smoothstep(fi - 0.5, fi + 0.5, nC - 0.5);
        if (on <= 0.0) break;
        vec2 c = vec2(0.8 * sin(0.013 * sceneTime * (1.0 + 0.3 * fi) + fi * 2.1), 0.45 * cos(0.011 * sceneTime * (1.0 + 0.2 * fi) + fi * 1.3));
        float d = length(p - c);
        float w = on / (d * d + 0.02);
        wsum += w; rsum += w * d;
    }
    float r = rsum / max(wsum, 1e-4);
    r += rough * 0.004 * sin(atan(p.y, p.x) * 7.0 + T * 3.0);
    float x = r * N - T * 4.0;
    float f = abs(fract(x) - 0.5) * 2.0;                        // 0 at the ring centre line
    float px = fwidth(x) * 2.0 + 1e-4;
    float w = clamp(0.1 + 0.85 * dark, 0.05, 0.95);
    float ring = smoothstep(w + px, w - px, f);
    ring = mix(ring, w, smoothstep(0.4, 0.9, px));             // fade to tone where rings get too fine
    vec3 inkC = mix(vec3(1.0), glowColour(ph, p, hueP * 0.159), 0.2 + 0.6 * swell);
    vec3 lightBg = vec3(0.95, 0.93, 0.88), darkBg = vec3(0.02, 0.02, 0.03);
    vec3 onDark = darkBg + inkC * (1.0 - ring) * (1.0 + 0.4 * kick) * 0.95;   // light rings where the photo is light
    vec3 onLight = mix(lightBg, inkC * 0.15, ring);
    finish(mix(onDark, onLight, mode));
}
