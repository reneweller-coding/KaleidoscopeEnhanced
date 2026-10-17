//@doc
 * @brief NEBULA DUST PILLARS FIELD: dust pillars in a glowing nebula, an endless field of them -- dark columns of
 * dust and gas standing against the light, sculpted by the wind of hot stars: their tops facing the wind glow with a
 * bright rim where the light eats them away, wisps stream off them downwind, and the gas between shines.  The wind
 * keeps blowing, the pillars slowly erode and drift; the photo colours the glowing gas.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the stellar wind blows (integrated: the music's drive)
 *   audioSwell      -> the rims glow brighter
 *   audioKick       -> stars in the gas twinkle (light)
 *
 * Knobs: pillarsP (how many pillars), windP (how hard the wind sculpts), photoP (photo share), hueP.
//@params pillarsP windP photoP
//@audio audioSwell audioKick
//@body
/**  The dust's density: ridged noise stretched into columns, warped downwind.
 *
 * @param x     The point. (in)
 * @param t     The wind's time. (in)
 * @param n     The pillars' frequency. (in)
 * @param wind  How hard the wind sculpts. (in)
 *
 * @return
 *   The density.
 **/
float dust(vec2 x, float t, float n, float wind)
{
    vec2 q = x + vec2(0.0, -0.06 * t);
    q.x += wind * 0.15 * (fbm(q * vec2(1.5, 0.8) + vec2(0.0, 0.3 * t)) - 0.5) * (0.5 + q.y);
    float col = 1.0 - abs(2.0 * noise2(vec2(q.x * n, 0.3 * q.y * n)) - 1.0);   // columns
    float body = smoothstep(0.55, 0.9, col) * smoothstep(0.65, -0.2, q.y + 0.25 * fbm(q * 2.0));
    return body * (0.5 + 0.8 * fbm(q * 9.0 + vec2(0.0, t * 0.2)));
}

void main()
{
    vec2 p = screenP();
    float n = 4.0 + 4.0 * clamp(pillarsP, 0.0, 1.0);
    float wind = 0.5 + 1.2 * clamp(windP, 0.0, 1.0);
    float t = 0.4 * sceneTime + 1.5 * audioAdvance;
    vec2 x = p + vec2(0.01 * t, 0.0);
    float d = dust(x, t, n, wind);
    float dUp = dust(x + vec2(0.0, 0.006), t, n, wind);         // the wind comes from above: the rim faces it
    float rim = clamp((d - dUp) * 10.0, 0.0, 1.0) * (0.6 + 0.8 * clamp(audioSwell, 0.0, 1.0));
    vec3 photo = imgLod(p * 0.45 + vec2(0.5, 0.55), 2.5);
    vec3 tone = imgPalette(0.6 + 0.03 * audioPhase);
    vec3 gas = mix(tone * 1.3, photo * 1.6, 0.45 + 0.45 * clamp(photoP, 0.0, 1.0)) * (0.45 + 0.6 * fbm(p * 3.0 + vec2(0.05 * t, 0.0)));
    vec3 col = gas * (1.0 - 0.9 * smoothstep(0.1, 0.6, d));
    col += mix(gas, vec3(1.0, 0.9, 0.8), 0.5) * rim * 0.9;
    // stars: round, jittered, twinkling
    vec2 sc = floor(p * 60.0);
    vec2 sh = hash22(sc);
    float star = smoothstep(0.08, 0.0, length(fract(p * 60.0) - 0.5 - 0.35 * (sh - 0.5))) * step(0.93, sh.x) * (1.0 - smoothstep(0.1, 0.4, d));
    col += star * (0.5 + 0.7 * clamp(audioKick, 0.0, 1.0) * sh.y);
    finish(col);
}
