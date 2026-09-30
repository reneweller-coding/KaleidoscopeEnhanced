//@doc
 * @brief SALT WATERCOLOR BLOOMS: salt sprinkled into wet watercolour -- in a
 * dark, saturated wash, each salt grain draws the pigment away and leaves
 * a pale starburst: tiny feathery crystals of light spread across the
 * colour like frost flowers, clustering where the salt fell thickly,
 * while the wash itself shifts slowly between the photograph's colours.
 * Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the washes drift, the bursts grow (integrated, jump-free)
 *   audioSpread     -> burst size
 *   audioKick       -> the bursts brighten (light)
 *   audioMode       -> the wash: cool deep blues in minor, warm magentas in major (tint)
 *   audioRoughness  -> the feathering of the bursts
 *   audioSwell      -> wash saturation (slow)
 *
 * Knobs: saltP (salt density), washP (wash darkness), photoP (photo colours in the wash), hueP.
//@params saltP washP photoP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float T = 0.02 * sceneTime + 0.15 * audioAdvance;
    // The wash: soft variations of two or three pigments.
    vec2 uv = p * 0.4 + 0.5 + 0.1 * vec2(fbm3(p + T), fbm3(p - T + 3.0));
    vec3 ph = imgK(uv, 4.0);
    vec3 pig = mix(mix(vec3(0.1, 0.2, 0.55), vec3(0.55, 0.1, 0.4), mode), glowColour(ph, p, hueP * 0.159) * 0.7, 0.5 * clamp(photoP, 0.0, 1.0));
    // The wash itself carries the kaleidoscoped photo's colours.
    pig = mix(pig, glowColour(imgK(uv * 1.6, 1.5), p, hueP * 0.159) * (0.4 + 0.6 * luma(imgK(uv * 1.6, 1.5))), 0.55 * clamp(photoP + 0.3, 0.0, 1.3));
    pig = max(mix(vec3(luma(pig)), pig, 0.8 + 0.6 * swell), 0.0);
    float washV = 0.75 + 0.25 * fbm(p * 2.0 + vec2(T, 0.0));
    vec3 col = mix(vec3(0.95, 0.93, 0.88), pig, clamp(washV * (0.75 + 0.35 * clamp(washP, 0.0, 1.0)), 0.0, 1.0));
    // Salt bursts: jittered grains; each a feathery starburst of paler colour.
    float burstR = 0.3 + 0.3 * clamp(audioSpread, 0.0, 1.0);
    float clusterF = (0.25 + 0.75 * smoothstep(0.3, 0.7, fbm3(p * 1.5 + 9.0))) * (0.3 + 0.7 * clamp(saltP, 0.0, 1.0));
    float bleach = 0.0;
    for (int L = 0; L < 2; ++L) {
        float fl = float(L);
        float S = 6.0 + 6.0 * fl;
        vec2 g = p * S + fl * 7.0;
        vec2 gi = floor(g);
        for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
            vec2 id = gi + vec2(i, j);
            if (hash21(id + fl) > clusterF) continue;
            vec2 c = id + 0.2 + 0.6 * hash22(id + fl * 3.0);
            vec2 d = g - c;
            float r = length(d);
            float grow = smoothstep(0.0, 1.0, fract(T * 2.0 + hash21(id + 5.0)));
            float life = fract(T * 2.0 + hash21(id + 5.0));
            float R = burstR * (0.5 + 0.5 * hash21(id + 2.0)) * (0.3 + 0.7 * grow);
            float ang = atan(d.y, d.x);
            vec2 u = vec2(cos(ang), sin(ang));
            // Feathery arms: noise on the unit circle (seamless).
            float arms = 0.7 + 0.3 * (fbm3(u * (3.0 + 4.0 * rough) + id) - 0.5) * 2.0 + 0.15 * noise2(u * 14.0 + id * 3.0);
            float b = smoothstep(R * arms, R * arms * 0.3, r);
            b *= smoothstep(1.0, 0.8, life) * smoothstep(0.0, 0.05, life);
            bleach = max(bleach, b * (0.7 - 0.2 * fl));
        }
    }
    // Pale starbursts with a slightly darker rim (pigment pushed outward).
    vec3 pale = mix(col, vec3(0.95, 0.93, 0.88), 0.75);
    col = mix(col, pale * (1.0 + 0.3 * kick), bleach);
    col *= 1.0 - 0.15 * smoothstep(0.0, 0.2, bleach) * (1.0 - smoothstep(0.2, 0.5, bleach));
    finish(col);
}
