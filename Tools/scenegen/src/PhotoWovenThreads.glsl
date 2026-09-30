//@doc
 * @brief PHOTO WOVEN THREADS: the photograph woven into cloth -- the warp
 * threads carry the picture, the weft threads carry a second, shifted
 * view of it, and they pass over and under each other in a twill, each
 * thread round and shaded like real yarn with a fine fibre texture; the
 * cloth billows in slow waves, the threads ripple, and the picture
 * emerges from the interlacing.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the pictures drift through the cloth (integrated)
 *   audioSpread     -> the billowing waves
 *   audioKick       -> the silk sheen flares (light)
 *   audioMode       -> the weft: complementary colours in minor, the same photo in major (blend)
 *   audioRoughness  -> the fibre fuzz
 *   audioSwell      -> the threads' sheen (slow)
 *
 * Knobs: threadP (thread count), twillP (twill step), gapP (gaps between threads), hueP.
//@params threadP twillP gapP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    // Billowing cloth.
    float bill = (0.01 + 0.03 * clamp(audioSpread, 0.0, 1.0));
    vec2 wv = vec2(sin(p.y * 3.0 + 0.3 * sceneTime), sin(p.x * 2.5 - 0.25 * sceneTime));
    vec2 q = p + bill * wv;
    float shadeB = 1.0 + 3.0 * bill * (cos(p.y * 3.0 + 0.3 * sceneTime) + cos(p.x * 2.5 - 0.25 * sceneTime)) * 0.5;
    float N = 18.0 + 30.0 * clamp(threadP, 0.0, 1.0);
    vec2 g = q * N;
    vec2 gi = floor(g);
    vec2 f = fract(g) - 0.5;
    // Twill: warp over weft when (x + y * step) mod 4 < 2.
    float st = floor(1.0 + 2.0 * clamp(twillP, 0.0, 1.0));
    float warpOver = step(mod(gi.x + gi.y * st, 4.0), 1.5);
    float gap = 0.05 + 0.2 * clamp(gapP, 0.0, 1.0);
    // Thread profiles: round across, with fuzz.
    float warpW = smoothstep(0.5, 0.5 - gap, abs(f.x));
    float weftW = smoothstep(0.5, 0.5 - gap, abs(f.y));
    float warpProf = sqrt(max(0.0, 1.0 - (f.x * 2.0) * (f.x * 2.0)));
    float weftProf = sqrt(max(0.0, 1.0 - (f.y * 2.0) * (f.y * 2.0)));
    // Where the thread dips under, it darkens toward the crossing edges.
    float dipWarp = 0.6 + 0.4 * sqrt(max(0.0, 1.0 - (f.y * 2.0) * (f.y * 2.0)));
    float dipWeft = 0.6 + 0.4 * sqrt(max(0.0, 1.0 - (f.x * 2.0) * (f.x * 2.0)));
    float T = 0.01 * sceneTime + 0.08 * audioAdvance;
    vec2 cw = (gi + 0.5) / N;
    vec3 warpC = imgK(cw * 0.6 + 0.5 + vec2(T, 0.3 * T), 1.5);
    vec3 weftSame = imgK(cw * 0.6 + 0.5 + vec2(0.13 - 0.5 * T, 0.07 + T), 1.5);
    vec3 weftC = mix(vec3(1.0) - weftSame * 0.8, weftSame, mode);
    weftC = mix(weftC, glowColour(weftSame, cw, hueP * 0.159) * 0.8, 0.25);
    float fuzz = 1.0 - (0.08 + 0.2 * rough) * noise2(g * vec2(1.0, 8.0) + gi.y);
    float fuzz2 = 1.0 - (0.08 + 0.2 * rough) * noise2(g * vec2(8.0, 1.0) + gi.x);
    vec3 warp = warpC * (0.35 + 0.75 * warpProf) * fuzz * (warpOver > 0.5 ? 1.0 : dipWarp);
    vec3 weft = weftC * (0.35 + 0.75 * weftProf) * fuzz2 * (warpOver > 0.5 ? dipWeft : 1.0);
    // Sheen along each thread.
    float sheenA = pow(warpProf, 8.0), sheenB = pow(weftProf, 8.0);
    warp += vec3(1.0) * sheenA * (0.05 + 0.2 * swell + 0.4 * kick);
    weft += vec3(1.0) * sheenB * (0.05 + 0.2 * swell + 0.4 * kick);
    vec3 top = warpOver > 0.5 ? warp : weft;
    float topW = warpOver > 0.5 ? warpW : weftW;
    vec3 bot = warpOver > 0.5 ? weft * 0.55 : warp * 0.55;
    float botW = warpOver > 0.5 ? weftW : warpW;
    vec3 col = vec3(0.02);
    col = mix(col, bot, botW);
    col = mix(col, top, topW);
    // Where threads are finer than pixels, blend to the mean.
    float fine = smoothstep(0.25, 0.5, fwidth(g.x));
    col = mix(col, mix(warpC, weftC, 0.5) * 0.6, fine);
    finish(col * shadeB);
}
