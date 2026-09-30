//@doc
 * @brief TEXTURE SNOW VOLUME: heavy snow falling at night under a street
 * lamp -- flakes of every size drift down through deep space toward us,
 * near ones large, soft and out of focus, far ones tiny and sharp, all
 * swirling on gusts; the lamp's cone of light picks them out, and behind
 * the snow the photograph glows as blurred lights of a town.  Endless,
 * mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the snowfall (integrated, jump-free)
 *   audioSpread     -> gusts swirl the flakes
 *   audioKick       -> the lamp flickers brighter (light)
 *   audioMode       -> the light: cold blue in minor, warm sodium in major
 *   audioHigh       -> flakes glitter (light)
 *   audioSwell      -> the town lights behind (slow)
 *
 * Knobs: densityP (snow density), flakeP (flake size), lampP (lamp cone), hueP.
//@params densityP flakeP lampP
//@audio audioSpread audioKick audioMode audioHigh audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 lampC = mix(vec3(0.7, 0.85, 1.1), vec3(1.1, 0.75, 0.4), mode);
    // Town lights behind: the photo, heavily blurred, neon-ish.
    vec2 uv = p * 0.5 + 0.5 + vec2(0.002, 0.0) * sceneTime;
    vec3 town = neonOf(imgLod(uv, 5.0) + 1e-3, 1.5) * smoothstep(0.35, 0.8, luma(imgLod(uv, 4.0)));
    vec3 col = vec3(0.01, 0.012, 0.025) + town * (0.05 + 0.2 * swell);
    // The lamp cone: repeating lamps along x so the plane is endless.
    float lx = mod(p.x + 0.9, 1.8) - 0.9;
    float cone = smoothstep(0.35 + 0.3 * clamp(lampP, 0.0, 1.0), 0.0, abs(lx) / max(0.3 + (0.6 - p.y) * 0.6, 0.05));
    cone *= smoothstep(-0.8, 0.6, -p.y + 0.6);
    col += lampC * cone * 0.08 * (1.0 + 0.8 * kick);
    // Snow: depth layers of flakes.
    float T = 0.12 * sceneTime + 0.8 * audioAdvance;
    float gust = 0.2 + 0.6 * clamp(audioSpread, 0.0, 1.0);
    for (int L = 4; L >= 0; --L) {
        float fl = float(L);                                    // 0 near .. 4 far
        float S = (6.0 + 4.0 * (1.0 - clamp(flakeP, 0.0, 1.0))) * (1.0 + fl * 0.8);
        vec2 w = p + gust * 0.06 * vec2(sin(p.y * 3.0 + T * 2.0 + fl), 0.0);
        vec2 g = w * S + vec2(0.3 * sin(T * 0.7 + fl), T * (3.0 + fl * 0.5)) + fl * 7.0;
        vec2 gi = floor(g);
        vec2 c = 0.2 + 0.6 * hash22(gi + fl) + 0.12 * vec2(sin(T * 3.0 + hash21(gi) * 6.28), 0.0);
        float d = length(fract(g) - c);
        float on = step(hash21(gi + 5.0 + fl), 0.2 + 0.5 * clamp(densityP, 0.0, 1.0));
        // Near flakes: large, soft (defocused); far: small, sharp.
        float R = 0.12 + 0.12 * (1.0 - fl / 4.0);
        float soft = 0.02 + 0.12 * (1.0 - fl / 4.0);
        float flake = smoothstep(R, R - soft, d);
        float lit = 0.25 + 1.3 * cone;
        float tw = 1.0 + hi * 1.5 * step(0.9, hash21(gi + 8.0)) * pow(max(0.0, sin(sceneTime * 4.0 + hash21(gi) * 40.0)), 8.0);
        col += mix(vec3(0.85, 0.9, 1.0), lampC, cone) * on * flake * lit * tw * (0.6 - 0.08 * fl);
    }
    col = mix(col, col * glowColour(imgLod(uv, 6.0), p, hueP * 0.159) * 1.3, 0.06);
    finish(col);
}
