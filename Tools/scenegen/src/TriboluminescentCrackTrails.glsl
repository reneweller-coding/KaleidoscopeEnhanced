//@doc
 * @brief TRIBOLUMINESCENT CRACK TRAILS: triboluminescence: breaking crystals flash along the crack lines; the picture shows cracks running through the photo, with blue light flickering at the tips, without any jolting (soft pulses).  A coarse Voronoi net is the crack network; a crack opens where the distance
 * between the neighbouring cells falls below a slowly growing limit, a glowing front runs along the edges as the limit passes, and a dark line stays behind it.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the cracks run on (the limit grows) (integrated)
 *   audioSwell   -> the brightness of the light at the tips
 *
 * Knobs: sizeP (the size of the fragments), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.2 + 0.16 * clamp(sizeP, 0.0, 1.0);
    vec2 g = p / S;
    vec2 gi = floor(g);
    float d1 = 1e3;
    float d2 = 1e3;
    for (int dy = -1; dy <= 1; ++dy)
        for (int dx = -1; dx <= 1; ++dx) {
            vec2 cj = gi + vec2(float(dx), float(dy));
            vec2 h = hash22(cj);
            vec2 pt = cj + 0.5 + 0.4 * (h - 0.5) * 2.0;
            float d = length(g - pt);
            if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
        }
    float web = d2 - d1;
    float cyc = fract(0.02 * audioAdvance + 0.025 * sceneTime);
    float lim = 0.02 + 0.55 * cyc;
    float seed = fbm(p * 4.0 + 3.0) * 0.3;
    float open = smoothstep(lim - 0.02, lim, web + seed * 0.0 + 0.25 * (1.0 - hash21(floor(g * 0.5)) ) * 0.0);
    float crack = 1.0 - smoothstep(0.0, 0.03, web) * 1.0;
    float reach = 1.0 - smoothstep(lim * 0.2, lim * 0.2 + 0.1, web - (0.0)) ;
    float front = exp(-pow((web - (0.02 + 0.3 * (1.0 - cyc))) / 0.025, 2.0)) * (0.4 + 0.6 * fbm(p * 20.0 + 0.05 * sceneTime));
    float line = 1.0 - smoothstep(0.0, 0.02 + 0.015 * (1.0 - cyc), web);
    float visible = smoothstep(0.0, 0.5, cyc * 1.6 - web * 0.8 + 0.3 * seed);
    vec3 c = imgLod(p * 0.85 + 0.5, 0.6);
    vec3 col = c * (0.5 + 0.5 * smoothstep(0.0, 0.2, web) * 0.8);
    col = mix(col, vec3(0.02, 0.02, 0.03), line * 0.9 * visible);
    float glow = exp(-pow(web / 0.06, 2.0)) * (0.5 + 0.5 * sin(40.0 * p.x + 3.0 * sceneTime)) * 0.3 * visible;
    col += vec3(0.35, 0.55, 1.0) * (glow * 1.5 + front * 0.8 * visible * 0.0) * (0.4 + 1.2 * clamp(audioSwell, 0.0, 1.0)) * line;
    col += vec3(0.4, 0.6, 1.0) * exp(-pow(web / 0.012, 2.0)) * (0.2 + 0.8 * (1.0 - cyc)) * (0.5 + 1.0 * clamp(audioSwell, 0.0, 1.0)) * visible * 0.6;
    finish(col * 1.1);
}
