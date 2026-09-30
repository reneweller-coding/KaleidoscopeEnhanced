//@doc
 * @brief TEXTURE AURORA VOLUME: standing beneath an aurora and looking up --
 * great curtains of green and violet light hang overhead in deep
 * perspective, their folds rippling and rolling across the sky, rays
 * streaming down from them toward us, a corona where the rays converge
 * straight above; stars shine through, and the colours are tinted by the
 * photograph.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the curtains roll (integrated, jump-free)
 *   audioSpread     -> the curtains spread across the sky
 *   audioBass       -> the curtains brighten (light)
 *   audioMode       -> colours: green-violet in minor, red-gold in major (tint)
 *   audioRoughness  -> the fine rays flicker
 *   audioSwell      -> the corona (slow)
 *
 * Knobs: curtainP (curtain count), rayP (ray density), photoP (photo tint), hueP.
//@params curtainP rayP photoP
//@audio audioSpread audioBass audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float bass = clamp(audioBass, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float T = 0.05 * sceneTime + 0.35 * audioAdvance;
    // Looking up: radial distance from the zenith = elevation.
    float r = length(p);
    float a = atan(p.y, p.x);
    vec2 u = vec2(cos(a), sin(a));
    vec3 col = vec3(0.005, 0.01, 0.03) * (1.0 + r);
    // Stars.
    vec2 sg = p * 60.0;
    vec2 si = floor(sg);
    col += vec3(0.8, 0.85, 1.0) * smoothstep(0.2, 0.02, length(fract(sg) - 0.25 - 0.5 * hash22(si))) * step(0.93, hash21(si)) * 0.4;
    // Curtains: bands in the sky plane (projected), folds rolling along them.
    float nC = 2.0 + 3.0 * clamp(curtainP, 0.0, 1.0);
    vec3 green = mix(vec3(0.2, 1.0, 0.45), vec3(1.0, 0.35, 0.2), mode);
    vec3 violet = mix(vec3(0.55, 0.3, 1.0), vec3(1.0, 0.8, 0.3), mode);
    vec3 tint = glowColour(imgLod(p * 0.3 + 0.5, 5.0), p, hueP * 0.159);
    green = mix(green, tint, 0.25 * clamp(photoP, 0.0, 1.0));
    float spread = 0.5 + 0.7 * clamp(audioSpread, 0.0, 1.0);
    for (int k = 0; k < 5; ++k) {
        float fk = float(k);
        float on = smoothstep(fk - 0.5, fk + 0.5, nC - 0.5);
        if (on <= 0.0) break;
        // A curtain: a wavy line across the sky, seen in perspective (the plane sits above us).
        float off = (fk - (nC - 1.0) * 0.5) * 0.35 * spread;
        float fold = 0.12 * sin(p.x * 3.0 + T * (1.0 + 0.3 * fk) + fk * 2.0) + 0.06 * sin(p.x * 7.0 - T * 1.7 + fk);
        float d = p.y - off - fold;
        // Curtain height: bright lower edge, fading upward (toward the zenith side).
        float lower = smoothstep(-0.01, 0.02, d) * exp(-max(d, 0.0) * (6.0 - 2.0 * swell));
        // Rays along the curtain: vertical streaks flickering.
        float rays = 0.6 + 0.4 * noise2(vec2(p.x * (30.0 + 40.0 * clamp(rayP, 0.0, 1.0)) + fk * 7.0, T * (2.0 + 3.0 * rough)));
        float I = lower * rays;
        vec3 c = mix(green, violet, smoothstep(0.02, 0.25, d));
        col += c * I * (0.5 + 0.7 * bass) * on;
    }
    // Corona near the zenith: rays converging.
    float corona = exp(-r * 5.0) * (0.3 + 0.7 * pow(0.5 + 0.5 * cos(a * 12.0 + T * 2.0), 3.0));
    col += green * corona * (0.1 + 0.5 * swell);
    finish(col);
}
