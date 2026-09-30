//@doc
 * @brief TEXTURE HEAT GLOW METAL: a steel plate with the photograph stamped
 * into it, heated by wandering torches -- where the flames play, the metal
 * glows through the incandescent colours (dull red, cherry, orange,
 * yellow, near white), the relief of the photo glowing unevenly, and
 * around each hot spot the temper colours bloom in rings (straw, bronze,
 * purple, blue) where the steel has been heated and cooled; the rest is
 * dark forged steel with a faint sheen.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the torches wander (integrated, jump-free)
 *   audioBass       -> the glow flares (light)
 *   audioSpread     -> the heat spreads wider
 *   audioMode       -> fewer, hotter torches in major; more, cooler in minor (blend)
 *   audioRoughness  -> the scale texture on the steel
 *   audioSwell      -> the temper rings widen (slow)
 *
 * Knobs: torchP (torch count), temperP (temper colours), reliefP (photo relief), hueP.
//@params torchP temperP reliefP
//@audio audioBass audioSpread audioMode audioRoughness audioSwell
//@body
vec3 blackbody(float t)
{
    // t 0..1: dark -> dull red -> orange -> yellow -> white.
    vec3 c = mix(vec3(0.0), vec3(0.45, 0.02, 0.0), smoothstep(0.0, 0.3, t));
    c = mix(c, vec3(1.0, 0.25, 0.02), smoothstep(0.3, 0.55, t));
    c = mix(c, vec3(1.0, 0.7, 0.2), smoothstep(0.55, 0.8, t));
    c = mix(c, vec3(1.0, 0.95, 0.8), smoothstep(0.8, 1.0, t));
    return c;
}
vec3 temper(float t)
{
    // Temper sequence by (past) temperature: straw, bronze, purple, blue, grey.
    vec3 c = mix(vec3(0.3, 0.3, 0.32), vec3(0.85, 0.75, 0.45), smoothstep(0.0, 0.2, t));
    c = mix(c, vec3(0.7, 0.45, 0.25), smoothstep(0.2, 0.4, t));
    c = mix(c, vec3(0.45, 0.2, 0.5), smoothstep(0.4, 0.6, t));
    c = mix(c, vec3(0.2, 0.3, 0.7), smoothstep(0.6, 0.8, t));
    c = mix(c, vec3(0.45, 0.55, 0.65), smoothstep(0.8, 1.0, t));
    return c;
}

void main()
{
    vec2 p = screenP();
    float bass = clamp(audioBass, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec2 uv = p * 0.6 + 0.5;
    float relief = texHeight(uv, 3.0, 0.4);
    float T = 0.05 * sceneTime + 0.35 * audioAdvance;
    float heat = 0.0, past = 0.0;
    float nT = 2.0 + 3.0 * clamp(torchP, 0.0, 1.0);
    float spread = 0.08 + 0.08 * clamp(audioSpread, 0.0, 1.0);
    for (int i = 0; i < 5; ++i) {
        float fi = float(i);
        float on = smoothstep(fi - 0.5, fi + 0.5, nT - 0.5);
        if (on <= 0.0) break;
        vec2 c = vec2(0.75 * sin(T * (0.6 + 0.2 * fi) + fi * 2.3), 0.4 * cos(T * (0.5 + 0.25 * fi) + fi * 1.7));
        float d = length(p - c);
        float hot = exp(-d * d / (spread * spread * mix(1.3, 0.7, mode)));
        heat += hot * on * mix(0.8, 1.2, mode);
        // Where the torch has been: a wider, older heating (temper rings).
        past += exp(-d * d / (spread * spread * (8.0 + 10.0 * swell))) * on;
    }
    float tp = clamp(heat * (0.45 + 0.6 * relief * (0.5 + clamp(reliefP, 0.0, 1.0))) * (0.7 + 0.4 * bass), 0.0, 1.1);
    // Forged steel with scale.
    float scale = noise2(p * 60.0) * 0.5 + noise2(p * 180.0) * 0.5;
    vec3 steel = vec3(0.12, 0.12, 0.13) * (0.7 + 0.6 * relief) * (0.85 + (0.1 + 0.3 * rough) * scale);
    vec3 tc = temper(clamp(past * 0.8, 0.0, 1.0));
    vec3 col = mix(steel, steel * 0.4 + tc * 0.45, smoothstep(0.05, 0.3, past) * (0.4 + 0.6 * clamp(temperP, 0.0, 1.0)));
    col += blackbody(tp) * 1.4;
    col = mix(col, col * glowColour(imgLod(uv, 6.0), p, hueP * 0.159) * 1.3, 0.06);
    // Faint sheen.
    col += vec3(0.8, 0.85, 0.9) * pow(max(0.0, dot(normalize(vec3(-texGrad(uv, 3.0) * 0.003, 1.0)), normalize(vec3(-0.5, 0.5, 0.7)))), 40.0) * 0.15;
    finish(col);
}
