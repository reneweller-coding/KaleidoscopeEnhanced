//@doc
 * @brief TEXTURE MURMURATION SHAPE: a starling murmuration at dusk -- tens
 * of thousands of birds swirl as one living cloud against the evening
 * sky, the flock thickening and thinning in waves that ripple through it,
 * folding, splitting and rejoining; the flock's shape is drawn from the
 * photograph's dark forms, which it keeps morphing toward; each bird is a
 * tiny dark fleck.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flock wheels and ripples (integrated, jump-free)
 *   audioSpread     -> the flock spreads out
 *   audioKick       -> a wave of density ripples through (light: darker)
 *   audioMode       -> the sky: blue dusk in minor, orange sunset in major
 *   audioRoughness  -> the flock frays at its edges
 *   audioSwell      -> the sky glow (slow)
 *
 * Knobs: birdP (bird density), waveP (ripple strength), shapeP (how much the photo shapes the flock), hueP.
//@params birdP waveP shapeP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    // Sky gradient.
    vec3 top = mix(vec3(0.15, 0.25, 0.5), vec3(0.35, 0.3, 0.55), mode);
    vec3 low = mix(vec3(0.6, 0.65, 0.8), vec3(1.0, 0.6, 0.35), mode);
    float sy = 0.5 + 0.5 * sin(p.y * 1.3 - 0.4);
    vec3 col = mix(low, top, sy) * (0.7 + 0.5 * swell);
    col = mix(col, col * glowColour(imgLod(p * 0.3 + 0.5, 6.0), p, hueP * 0.159) * 1.3, 0.1);
    float T = 0.08 * sceneTime + 0.5 * audioAdvance;
    // Flock density: a warped blob field shaped by the photo's dark forms.
    vec2 w = p + 0.25 * vec2(sin(T + p.y * 1.5), cos(T * 0.8 + p.x * 1.3));
    w += 0.15 * vec2(fbm3(p * 1.5 + T), fbm3(p * 1.5 - T + 4.0));
    vec2 uv = w * 0.5 + 0.5 + vec2(0.02 * sin(T * 0.3), 0.0);
    float shapeD = 1.0 - luma(imgLod(uv, 4.5));
    float blob = fbm(w * 1.2 + vec2(T * 0.5, 0.0));
    float spread = 0.2 * clamp(audioSpread, 0.0, 1.0);
    // The photo shapes the flock by local contrast (every photo gives some shape).
    shapeD = 0.5 + (shapeD - (1.0 - luma(imgLod(uv, 7.0)))) * 2.0;
    float field = mix(blob, shapeD, 0.5 * clamp(shapeP, 0.0, 1.0)) + 0.1 * rough * (noise2(p * 10.0 + T) - 0.5);
    float dens = smoothstep(0.42 + spread, 0.72, field) * smoothstep(0.9, 0.6, length(w * vec2(0.6, 1.0)) - 0.3);
    // Ripples of density travelling through the flock.
    float rip = sin(dot(w, vec2(6.0, 3.0)) - T * 8.0) * (0.15 + 0.35 * clamp(waveP, 0.0, 1.0));
    dens = clamp(dens * (1.0 + rip) + kick * 0.2 * dens, 0.0, 1.0);
    // Birds: tiny dark flecks, their density controlling how many show.
    float fleck = 0.0;
    for (int L = 0; L < 2; ++L) {
        float fl = float(L);
        vec2 g = p * (160.0 + 90.0 * fl) + fl * 7.0 + vec2(T * 30.0, T * 10.0) * (1.0 + 0.2 * fl);
        vec2 gi = floor(g);
        vec2 c = 0.25 + 0.5 * hash22(gi + fl);
        float d = length(fract(g) - c);
        float on = step(hash21(gi + 3.0 + fl), dens * (0.4 + 0.6 * clamp(birdP, 0.0, 1.0)));
        fleck = max(fleck, on * smoothstep(0.35, 0.1, d));
    }
    // Where the flock is dense the flecks merge into a dark mass.
    float mass = smoothstep(0.5, 1.0, dens) * 0.6;
    col *= 1.0 - max(fleck * 0.85, mass);
    finish(col);
}
