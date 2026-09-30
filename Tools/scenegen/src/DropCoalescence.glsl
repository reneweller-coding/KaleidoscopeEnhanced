//@doc
 * @brief DROP COALESCENCE: coloured liquid drops seen from above in a dark
 * dish -- glossy blobs of ink-coloured liquid wander, touch, and flow into
 * each other with a soft neck, their colours mixing where they merge, then
 * pull apart again; each drop is a small lens showing the photograph
 * magnified and bent inside it, with a bright meniscus highlight and a
 * darker rim.  The drops' colours come from the photo beneath them.
 * Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the drops wander (integrated, jump-free)
 *   audioSpread     -> drop size: more merging when the music is wide
 *   audioRoughness  -> a haze of tiny satellite droplets
 *   audioKick       -> the highlights flare (light)
 *   audioMode       -> the dish: cool in minor, warm in major
 *   audioSwell      -> the photo glows through the dish (slow)
 *
 * Knobs: countP (drop scale), mergeP (how readily they merge), lensP (lens strength), hueP.
//@params countP mergeP lensP
//@audio audioSpread audioRoughness audioKick audioMode audioSwell
//@body
// Metaball field of one drop layer: value, gradient and colour-weighted sum.
void dropField(vec2 q, float T, float rad, float seed, inout float F, inout vec2 G, inout vec3 C, inout float W)
{
    vec2 gi = floor(q);
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 id = gi + vec2(i, j);
        float h1 = hash21(id + seed), h2 = hash21(id + seed + 3.1), h3 = hash21(id + seed + 7.7);
        vec2 c = id + 0.5 + 0.42 * vec2(sin(T * (0.6 + 0.5 * h1) + h2 * 6.28), cos(T * (0.5 + 0.5 * h2) + h3 * 6.28));
        float r = rad * (0.55 + 0.45 * sin(T * 0.3 + h1 * 6.28) * 0.5 + 0.45 * h3);
        vec2 d = q - c;
        float e = exp(-dot(d, d) / (r * r) * 2.5);
        F += e;
        G += e * (-5.0 * d / (r * r));
        vec2 cuv = c / 7.0 * 0.8 + 0.5;
        vec3 pc = glowColour(imgLod(cuv, 4.0), c * 0.1, hueP * 0.159 + seed * 0.07);
        vec3 fc = hsv2rgb(vec3(fract(hueP * 0.159 + h2 * 0.6 + 0.02 * T), 0.8, 1.0));
        C += e * mix(pc, fc, 0.25 + 0.5 * step(0.5, h1));
        W += e;
    }
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float S = 3.5 + 3.5 * clamp(countP, 0.0, 1.0);
    vec2 q = p * S + vec2(0.05, 0.03) * sceneTime;
    float T = 0.25 * sceneTime + 1.5 * audioAdvance;
    float rad = 0.55 + 0.15 * clamp(audioSpread, 0.0, 1.0);
    float F = 0.0, W = 0.0; vec2 G = vec2(0.0); vec3 C = vec3(0.0);
    dropField(q, T, rad, 0.0, F, G, C, W);
    // Satellite droplets: a second, finer layer that joins the same field.
    float sat = 0.25 + 0.75 * clamp(audioRoughness, 0.0, 1.0);
    float F2 = 0.0, W2 = 0.0; vec2 G2 = vec2(0.0); vec3 C2 = vec3(0.0);
    dropField(q * 3.0 + 11.0, T * 1.3, 0.3, 5.0, F2, G2, C2, W2);
    // Satellites keep clear of the big drops (no warts on their domes).
    float away = 1.0 - smoothstep(0.15, 0.4, F);
    float ks = 0.9 * sat * away;
    F += F2 * ks; G += G2 * 3.0 * ks; C += C2 * ks; W += W2 * ks;
    vec3 dropC = C / max(W, 1e-4);
    float th = 0.5 - 0.18 * clamp(mergeP, 0.0, 1.0);
    float aa = length(G) * S / resolution.y * 1.5 + 1e-3;
    float inside = smoothstep(th - aa, th + aa, F);
    float h = smoothstep(th, th + 0.9, F);                     // dome height
    vec2 uv = p * 0.8 + 0.5 + vec2(0.004, 0.003) * sceneTime;
    // The dish: the photo, dark and slightly blurred.
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 dish = imgLod(uv, 2.5) * (0.07 + 0.1 * swell) * mix(vec3(0.7, 0.85, 1.1), vec3(1.1, 0.9, 0.7), mode);
    // Inside: the photo magnified by the lens, tinted by the drop's colour.
    vec2 n2 = -G / (1.0 + length(G) * 0.15) * 0.08 * (0.4 + 0.8 * clamp(lensP, 0.0, 1.0));
    vec3 seen = imgLod(uv + n2 / S * 4.0, 0.6);
    vec3 dcol = mix(dropC, dropC * (0.35 + 1.3 * luma(seen)) + seen * 0.25, 0.7);
    dcol *= 0.6 + 0.6 * h;
    // Darker rim where the surface is steep, bright meniscus highlight.
    vec3 nrm = normalize(vec3(-G * 0.2, 1.0));
    float rim = 1.0 - nrm.z;
    dcol *= 1.0 - 0.6 * smoothstep(0.1, 0.6, rim);
    float spec = pow(max(dot(nrm, normalize(vec3(-0.4, 0.5, 0.8))), 0.0), 40.0) * 1.3;
    float spec2 = pow(max(dot(nrm, normalize(vec3(0.5, -0.3, 0.8))), 0.0), 200.0);
    vec3 col = mix(dish, dcol, inside);
    col += inside * (spec * (0.5 + 0.9 * kick) + spec2 * 0.4) * vec3(1.0, 0.98, 0.95);
    // A faint shadow ring around each drop on the dish.
    col *= 1.0 - (1.0 - inside) * 0.5 * smoothstep(th * 0.4, th, F);
    finish(col);
}
