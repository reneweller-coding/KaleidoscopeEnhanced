//@doc
 * @brief KURAMOTO RINGS: a field of thousands of blinking lights that keep
 * falling into step -- each light is an oscillator; at first they flicker
 * at random, then neighbours pull each other into rhythm and spiral waves
 * of flashes sweep across the field, turning around wandering centres
 * like the waves in a chemical clock; then the order dissolves into
 * flicker again, and re-forms elsewhere.  Each light takes its colour from
 * the photograph beneath.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the waves travel (integrated, jump-free)
 *   audioSpread     -> how strongly the field synchronises
 *   audioKick       -> the flashes flare (light)
 *   audioMode       -> colour: cool in minor, warm in major
 *   audioHigh       -> the flicker sparkles (light)
 *   audioSwell      -> the glow between the lights (slow)
 *
 * Knobs: dotP (light spacing), armsP (spiral arms), photoP (photo colours), hueP.
//@params dotP armsP photoP
//@audio audioSpread audioKick audioMode audioHigh audioSwell
//@body
float phaseAt(vec2 x, float T, float arms)
{
    float ph = 0.0;
    for (int i = 0; i < 4; ++i) {
        float fi = float(i);
        vec2 c = 0.6 * vec2(sin(0.017 * sceneTime * (1.0 + 0.3 * fi) + fi * 2.1), 0.4 * cos(0.013 * sceneTime * (1.0 + 0.2 * fi) + fi * 1.4));
        vec2 d = x - c;
        float charge = mod(fi, 2.0) < 0.5 ? 1.0 : -1.0;
        ph += charge * arms * atan(d.y, d.x) + 9.0 * length(d) * exp(-length(d) * 0.5);
    }
    return ph - T;
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float T = 2.0 * sceneTime + 10.0 * audioAdvance;
    float arms = floor(1.0 + 2.0 * clamp(armsP, 0.0, 1.0));   // integer: the atan cut vanishes under cos
    // Synchrony comes and goes, in slowly moving regions.
    float sync = smoothstep(0.35, 0.65, 0.5 + 0.5 * sin(0.05 * sceneTime + 3.0 * fbm3(p * 0.8)) * 0.8 + 0.3 * (clamp(audioSpread, 0.0, 1.0) - 0.5));
    float S = 28.0 + 30.0 * (1.0 - clamp(dotP, 0.0, 1.0));
    vec2 g = p * S;
    vec2 gi = floor(g);
    vec3 col = vec3(0.0);
    vec2 uv0 = p * 0.6 + 0.5;
    vec3 base = glowColour(imgLod(uv0, 5.0), p, hueP * 0.159);
    base = mix(base, base * mix(vec3(0.7, 0.9, 1.2), vec3(1.2, 0.9, 0.7), mode), 0.5);
    col += base * (0.02 + 0.06 * swell) * sync;
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 id = gi + vec2(i, j);
        vec2 c = id + 0.2 + 0.6 * hash22(id);
        vec2 cw = c / S;
        float own = hash21(id + 3.0) * 6.2831853 + T * (0.9 + 0.2 * hash21(id + 4.0));   // its own free rhythm
        float wave = phaseAt(cw, T, arms);
        // Blend phases on the circle (no wrap jump): mix the unit vectors.
        vec2 u = mix(vec2(cos(own), sin(own)), vec2(cos(wave), sin(wave)), sync);
        float ph = atan(u.y, u.x);
        float flash = pow(max(0.0, cos(ph)), 6.0);
        float d = length(g - c);
        vec3 pc = mix(base, glowColour(imgLod(cw * 0.6 + 0.5, 3.0), cw, hueP * 0.159), clamp(photoP, 0.0, 1.0) * 0.7);
        float I = 0.06 + flash * (1.1 + 1.2 * kick) + (1.0 - sync) * hi * 0.4 * flash;
        col += pc * (smoothstep(0.3, 0.08, d) * 1.2 + exp(-d * 3.5) * 0.25) * I;
    }
    finish(col);
}
