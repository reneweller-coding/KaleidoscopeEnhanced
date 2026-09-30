//@doc
 * @brief CARAMEL BUBBLING: a pan of caramelising sugar seen from above --
 * a molten golden-to-amber surface crowded with bubbles of every size
 * that swell, glint and burst, leaving rings that close over, the colour
 * deepening from pale gold to dark amber in slow swirls; the photograph
 * lends its patterns to the swirls of colour.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the bubbling (integrated, jump-free)
 *   audioSpread     -> bubble size
 *   audioKick       -> the bubble highlights glint (light)
 *   audioMode       -> the caramel: pale gold in minor, dark amber in major
 *   audioRoughness  -> more small bubbles
 *   audioSwell      -> the heat glow (slow)
 *
 * Knobs: bubbleP (bubble density), swirlP (colour swirls), photoP (photo in the swirls), hueP.
//@params bubbleP swirlP photoP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float T = 0.1 * sceneTime + 0.6 * audioAdvance;
    vec2 uv = p * 0.5 + 0.5;
    // Colour swirls: darkening caramel.
    float sw = fbm(p * 2.0 + (0.5 + clamp(swirlP, 0.0, 1.0)) * vec2(fbm3(p * 1.5 + T * 0.2), fbm3(p * 1.5 - T * 0.2 + 4.0)));
    sw = mix(sw, luma(imgK(uv, 3.0)), 0.4 * clamp(photoP, 0.0, 1.0));
    vec3 pale = vec3(0.95, 0.72, 0.35), dark = vec3(0.45, 0.18, 0.04);
    vec3 car = mix(pale, dark, clamp(sw * 0.8 + mode * 0.4, 0.0, 1.0));
    car = mix(car, car * glowColour(imgLod(uv, 5.0), p, hueP * 0.159) * 1.2, 0.08);
    vec3 col = car * (0.8 + 0.3 * swell);
    // Bubbles: two scales; each grows, bursts (ring), and heals.
    float nrm = 0.0; float ring = 0.0; float glint = 0.0;
    for (int L = 0; L < 2; ++L) {
        float fl = float(L);
        float S = (3.0 + 6.0 * fl) * (1.3 - 0.5 * clamp(audioSpread, 0.0, 1.0));
        vec2 g = p * S + fl * 5.0;
        vec2 gi = floor(g);
        for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
            vec2 id = gi + vec2(i, j);
            float h = hash21(id + fl * 3.0);
            if (h > (0.35 + 0.4 * clamp(bubbleP, 0.0, 1.0)) * (fl > 0.5 ? 0.4 + 0.6 * rough : 1.0)) continue;
            float cyc = T * (0.8 + 0.8 * h) + h * 5.0;
            float life = fract(cyc);
            float gen = floor(cyc);
            vec2 c = id + 0.2 + 0.6 * hash22(id + gen * 1.3 + fl);
            float R = 0.4 * smoothstep(0.0, 0.8, life) * (0.6 + 0.4 * hash21(id + gen + 2.0));
            float d = length(g - c);
            // Dome while growing; after bursting (life > 0.8) a fading ring.
            float grow = 1.0 - smoothstep(0.78, 0.82, life);
            float dome = smoothstep(R, R * 0.2, d) * grow;
            nrm = max(nrm, dome);
            float burst = smoothstep(0.8, 0.85, life) * smoothstep(1.0, 0.85, life);
            ring = max(ring, exp(-abs(d - R * (1.0 + (life - 0.8) * 2.0)) * 30.0) * burst);
            glint = max(glint, smoothstep(0.35, 0.1, length((g - c) / max(R, 1e-3) - vec2(-0.35, 0.35))) * grow * step(0.05, R));
        }
    }

    // Domes: lighter thin sugar film, shaded as spheres (bright top-left, dark lower rim).
    col = mix(col, mix(col, pale * 1.2, 0.55), nrm);
    col *= 1.0 - 0.35 * smoothstep(0.0, 0.3, nrm) * (1.0 - smoothstep(0.3, 0.8, nrm));
    col *= 1.0 - 0.25 * ring;
    col += vec3(1.0, 0.95, 0.85) * glint * (0.4 + 1.2 * kick);
    finish(col);
}
