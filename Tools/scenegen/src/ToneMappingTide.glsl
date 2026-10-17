//@doc
 * @brief TONE MAPPING TIDE: local tone mapping as a tide -- every point's brightness weighed against its
 * neighbourhood's, so that shadows open and highlights fold back while the detail between them springs out, and the
 * strength of that mapping lies over the picture as a landscape of swells that wanders across it: here the photo
 * glows with drawn-out detail like an HDR print, there it lies plain, and the swells roll on.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the mapping's strength
 *   audioAdvance    -> the swells roll and the photo drifts (integrated)
 *
 * Knobs: strengthP (the base strength), reachP (the neighbourhood's size), photoP (photo share), hueP.
//@params strengthP reachP photoP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 drift = 0.04 * vec2(sin(0.013 * sceneTime + 0.01 * audioAdvance), cos(0.011 * sceneTime));
    vec2 uv = p * 0.5 + 0.5 + drift;
    float swellF = fbm(p * 1.5 + vec2(0.05 * sceneTime + 0.04 * audioAdvance, 0.02 * sceneTime));
    float k = (0.7 + 0.8 * clamp(strengthP, 0.0, 1.0)) * (0.6 + 0.8 * clamp(audioSwell, 0.0, 1.0)) * smoothstep(0.2, 0.7, swellF);
    float lodN = 3.5 + 2.5 * clamp(reachP, 0.0, 1.0);
    vec3 c = imgLod(uv, 0.0);
    float L = luma(c) + 1e-3;
    float La = luma(imgLod(uv, lodN)) + 1e-3;
    float Lw = luma(imgLod(uv, lodN + 2.0)) + 1e-3;
    // the local operator: the brightness against its surroundings, the surroundings pulled toward a middle key
    float mapped = (L / La) * pow(La / 0.45, 1.0 - 0.8 * k) * 0.45;
    float detail = pow(L / La, 1.0 + 0.8 * k);
    mapped = mix(mapped, mapped * detail / max(L / La, 1e-3), 0.5) * mix(1.0, 0.45 / Lw, 0.3 * k);
    vec3 col = c * (mapped / L);
    col = mix(c, col, 0.85 + 0.15 * (1.0 - clamp(photoP, 0.0, 1.0)));
    finish(col * 1.15);
}
