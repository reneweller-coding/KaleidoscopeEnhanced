//@doc
 * @brief TEXTURE GOBO WASH: a theatre stage wall washed by moving-head
 * lights -- several soft spots glide over a dark textured wall (the
 * photograph as the wall's surface), each projecting a rotating gobo
 * pattern (breakup leaves, star, spiral, dots) in its own colour, the
 * patterns overlapping and mixing additively, the edges soft with
 * defocus; the wall's relief catches the light.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the lights glide (integrated, jump-free)
 *   audioPhase      -> the gobos rotate (integrated)
 *   audioBass       -> the lights brighten (light)
 *   audioSpread     -> the spots grow
 *   audioMode       -> palette: cool in minor, warm in major
 *   audioSwell      -> the haze glow around the spots (slow)
 *
 * Knobs: spotP (number of lights), focusP (gobo sharpness), wallP (wall relief), hueP.
//@params spotP focusP wallP
//@audio audioPhase audioBass audioSpread audioMode audioSwell
//@body
float gobo(vec2 l, float kind, float rot, float sharp)
{
    l = rot2(rot) * l;
    float r = length(l);
    float a = atan(l.y, l.x);
    vec2 u = vec2(cos(a), sin(a));
    float v;
    if (kind < 0.5) v = smoothstep(0.45, 0.55 + 0.1 * (1.0 - sharp), fbm3(l * 5.0 + 3.0));                      // breakup
    else if (kind < 1.5) v = smoothstep(0.1, 0.0, abs(cos(a * 3.0)) * r - 0.05) + step(r, 0.12);                 // star
    else if (kind < 2.5) v = smoothstep(0.35, 0.15, abs(fract(r * 5.0 - atan(u.y, u.x) / 6.2831853 * 2.0) - 0.5)); // spiral (2 arms)
    else { vec2 g = fract(l * 5.0) - 0.5; v = smoothstep(0.25, 0.15, length(g)); }                             // dots
    return clamp(v, 0.0, 1.0);
}

void main()
{
    vec2 p = screenP();
    float bass = clamp(audioBass, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec2 uv = p * 0.6 + 0.5;
    vec3 wallTex = imgLod(uv, 1.0);
    float relief = texHeight(uv, 3.0, 0.4);
    vec2 gr = texGrad(uv, 3.0) * 0.004 * (0.3 + clamp(wallP, 0.0, 1.0));
    vec3 col = wallTex * 0.03;
    float nS = 2.0 + 3.0 * clamp(spotP, 0.0, 1.0);
    float T = 0.05 * sceneTime + 0.35 * audioAdvance;
    float R = 0.35 + 0.2 * clamp(audioSpread, 0.0, 1.0);
    float sharp = clamp(focusP, 0.0, 1.0);
    for (int i = 0; i < 5; ++i) {
        float fi = float(i);
        float on = smoothstep(fi - 0.5, fi + 0.5, nS - 0.5);
        if (on <= 0.0) break;
        vec2 c = vec2(0.7 * sin(T * (0.7 + 0.2 * fi) + fi * 2.1), 0.35 * cos(T * (0.5 + 0.3 * fi) + fi * 1.3));
        vec2 l = (p - c) / R;
        float disk = smoothstep(1.0, 0.8 - 0.3 * (1.0 - sharp), length(l));
        float kind = mod(fi, 4.0);
        float g = gobo(l, kind, (0.2 + 0.1 * fi) * (sceneTime * 0.3 + 2.0 * audioPhase) * (mod(fi, 2.0) < 0.5 ? 1.0 : -1.0), sharp);
        vec3 lc = hsv2rgb(vec3(fract(hueP * 0.159 + fi * 0.21 + mix(0.55, 0.05, mode)), 0.8, 1.0));
        lc = mix(lc, glowColour(imgLod(vec2(0.5), 6.0), vec2(fi, 0.0), hueP * 0.159 + fi * 0.2), 0.25);
        // The wall's relief catches the light from the spot's direction.
        vec3 n = normalize(vec3(-gr, 1.0));
        vec3 L = normalize(vec3(c - p, 0.8));
        float lit = max(dot(n, L), 0.0);
        col += lc * wallTex * disk * g * lit * (1.2 + 1.2 * bass) * on;
        col += lc * exp(-length(l) * 2.0) * (0.03 + 0.1 * swell) * on;   // haze
    }
    finish(col);
}
