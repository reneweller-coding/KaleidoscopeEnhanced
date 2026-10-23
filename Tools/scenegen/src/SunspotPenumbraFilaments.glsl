//@doc
 * @brief SUNSPOT PENUMBRA FILAMENTS: sunspots: a dark core (umbra) with a halo of fibres (penumbra) that run radially, surrounded by granulation; the photo lies as the photosphere, and the spots wander and grow.  Granules are small convection cells with bright centres and dark lanes, every spot is a dark disc
 * wrapped in a ring of radial streaks, and the number and size of the spots swell with the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the growth of the spots (their radius)
 *   audioAdvance -> the spots wander (integrated)
 *
 * Knobs: sizeP (the size of the granules), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float G = 0.022 + 0.02 * clamp(sizeP, 0.0, 1.0);
    vec2 g = p / G + 0.4 * sceneTime * vec2(0.1, -0.05);
    vec2 gi = floor(g);
    float d1 = 1e3;
    float d2 = 1e3;
    for (int dy = -1; dy <= 1; ++dy)
        for (int dx = -1; dx <= 1; ++dx) {
            vec2 cj = gi + vec2(float(dx), float(dy));
            vec2 h = hash22(cj);
            vec2 pt = cj + 0.5 + 0.38 * (h - 0.5) * 2.0 + 0.1 * vec2(sin(0.3 * sceneTime + 6.28 * h.x), cos(0.27 * sceneTime + 6.28 * h.y));
            float d = length(g - pt);
            if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
        }
    float gran = smoothstep(0.0, 0.5, d1) * 0.0 + smoothstep(0.0, 0.25, d2 - d1);
    vec3 c = imgLod(p * 0.85 + 0.5, 1.2);
    vec3 sun = mix(vec3(1.0, 0.7, 0.3), c * 1.3, 0.4) * (0.65 + 0.4 * gran) * (0.9 + 0.2 * (1.0 - smoothstep(0.0, 0.5, d1)));
    float t = 0.02 * audioAdvance + 0.015 * sceneTime;
    float umb = 0.0;
    float pen = 0.0;
    float fib = 0.0;
    for (int k = 0; k < 4; ++k) {
        float fk = float(k);
        vec2 h = hash22(vec2(fk, 7.0));
        vec2 cen = vec2(0.7 * (h.x - 0.5) * 1.78 + 0.1 * sin(t * (0.6 + h.y) + 6.28 * h.x), 0.7 * (h.y - 0.5) + 0.08 * cos(t * (0.5 + h.x) + 6.28 * h.y));
        float R = (0.07 + 0.08 * h.x) * (0.8 + 0.5 * clamp(audioSwell, 0.0, 1.0));
        vec2 d = p - cen;
        float r = length(d) / R;
        float a = atan(d.y, d.x);
        float fb = noise2(vec2(a * 14.0 + 3.0 * fk, r * 3.0)) * 0.6 + noise2(vec2(a * 40.0, r * 6.0 + 2.0)) * 0.4;
        umb = max(umb, 1.0 - smoothstep(0.35, 0.45, r));
        float pn = smoothstep(1.55, 1.2, r) * smoothstep(0.3, 0.5, r);
        pen = max(pen, pn);
        fib = max(fib, pn * fb);
    }
    vec3 pcol = sun * (0.2 + 0.8 * fib) * vec3(0.95, 0.75, 0.55);
    vec3 col = mix(sun, pcol, pen);
    col = mix(col, vec3(0.02, 0.01, 0.01) + sun * 0.05, umb);
    finish(col * 1.15);
}
