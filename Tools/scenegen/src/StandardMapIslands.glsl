//@doc
 * @brief STANDARD MAP ISLANDS: Chirikov's standard map, the kicked rotor -- p -> p + K sin(theta), theta -> theta + p
 * -- as a phase portrait: every pixel is a starting point, coloured by where its orbit goes on average.  Islands of
 * order (regular orbits on nested curves, chains of smaller islands around them) float in a chaotic sea of grain.
 * The kick grows and shrinks with the music, so islands swell, break up into chains and drown, and rise again.
 * Each orbit carries the photo's colour at its mean position.  A periodic field in both directions.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the kick strength K (continuous): calm music grows islands, loud music drowns them
 *   audioPhase      -> the portrait slides along the angle (integrated)
 *   audioKick       -> the island rims flash (light)
 *
 * Knobs: kickP (the base kick), itersP (orbit length: finer grain, sharper islands), cellsP (periods on screen), hueP.
//@params kickP itersP cellsP
//@audio audioSwell audioKick
//@body
void main()
{
    vec2 p = screenP();
    float cells = 1.0 + floor(clamp(cellsP, 0.0, 0.999) * 2.0);
    vec2 q = (p * cells + 0.5) * 6.2831853;
    q.x += 0.05 * audioPhase + 0.02 * sceneTime;
    float K = 1.1 + 1.6 * (0.3 + 0.7 * clamp(kickP, 0.0, 1.0)) * (0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    int n = 60 + int(80.0 * clamp(itersP, 0.0, 1.0));
    float th = q.x, pm = q.y;
    vec2 mean = vec2(0.0), m2 = vec2(0.0);
    for (int i = 0; i < 140; ++i) {
        if (i >= n) break;
        pm += K * sin(th);
        th += pm;
        vec2 s = vec2(sin(th), sin(pm));                        // periodic observables of the orbit
        mean += s;
        m2 += s * s;
    }
    mean /= float(n);
    vec2 var = m2 / float(n) - mean * mean;
    // regular orbits keep a sharp mean; chaotic ones wander everywhere (their means tend to zero, their spread to 1/2)
    float chaos = smoothstep(0.25, 0.48, var.x + var.y - 0.5 * dot(mean, mean));
    vec2 uv = mean * 0.45 + 0.5;
    vec3 photo = imgLod(uv, 0.4);
    vec3 tone = imgPalette(atan(mean.y, mean.x) / 6.2831853 + 0.03 * audioPhase);
    vec3 island = mix(photo * 1.2, tone * 1.3, 0.3);
    vec3 sea = imgLod(p * 0.7 + 0.5, 1.5) * 0.35 + tone * 0.06;
    vec3 col = mix(island, sea, chaos);
    float rim = abs(dFdx(chaos)) + abs(dFdy(chaos));
    col += mix(tone, vec3(1.0), 0.5) * min(rim * 2.0, 1.0) * (0.2 + 0.5 * clamp(audioKick, 0.0, 1.0));
    finish(col);
}
