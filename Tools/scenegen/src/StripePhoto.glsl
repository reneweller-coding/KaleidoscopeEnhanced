//@doc
 * @brief STRIPE PHOTO: the photograph rendered by bent stripes -- parallel
 * lines sweep across the view and bend where the picture is bright, as if
 * the image were a relief pushing up through a striped sheet (the classic
 * "line displacement" portrait); the stripes slide slowly, the photo
 * drifts beneath, and the stripe direction turns.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the stripes slide (integrated, jump-free)
 *   audioPhase      -> the stripe direction turns (integrated)
 *   audioSpread     -> displacement depth
 *   audioKick       -> the stripes brighten (light)
 *   audioMode       -> light lines on black in minor, dark lines on paper in major (blend)
 *   audioSwell      -> the stripes take on the photo's colours (slow)
 *
 * Knobs: stripeP (stripe density), widthP (line width), zoomP (photo scale), hueP.
//@params stripeP widthP zoomP
//@audio audioPhase audioSpread audioKick audioMode audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = smoothstep(0.3, 0.7, clamp(audioMode, 0.0, 1.0));
    float z = 0.4 + 0.5 * clamp(zoomP, 0.0, 1.0);
    vec2 uv = p * z + 0.5 + vec2(0.003, 0.002) * sceneTime;
    float ang = 0.3 * sin(0.01 * sceneTime) + 0.2 * audioPhase;
    vec2 d = vec2(cos(ang), sin(ang));
    vec2 nrm = vec2(-d.y, d.x);
    float N = 30.0 + 40.0 * clamp(stripeP, 0.0, 1.0);
    // Displacement: the photo's brightness lifts the stripes (perpendicular to them).
    float lum = luma(imgLod(uv, 4.0)) * 0.8 + 0.2 * luma(imgLod(uv, 2.5));
    float depth = (0.04 + 0.08 * clamp(audioSpread, 0.0, 1.0));
    float T = 0.05 * sceneTime + 0.3 * audioAdvance;
    float x = (dot(p, nrm) + depth * lum) * N - T * 10.0;
    float f = abs(fract(x) - 0.5) * 2.0;
    float px = fwidth(x) * 2.0 + 1e-4;
    float w = 0.12 + 0.3 * clamp(widthP, 0.0, 1.0);
    float line = smoothstep(w + px, w - px, f);
    line = mix(line, w, smoothstep(0.4, 0.9, px));
    vec3 pc = imgLod(uv, 1.5);
    vec3 lc = mix(vec3(1.0), glowColour(pc, p, hueP * 0.159), 0.15 + 0.7 * swell);
    vec3 dark = lc * line * (0.8 + 0.5 * kick);
    vec3 light = mix(vec3(0.94, 0.92, 0.88), lc * 0.2, line);
    finish(mix(dark, light, mode));
}
