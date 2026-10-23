//@doc
 * @brief ICE LENS HEAVE LAYERS: ice lenses in freezing ground: layers of pure ice lift the ground and press ground into layers; the photo colours the layers of earth, and the ice layers grow.  Horizontal layers of soil in the photo's colours alternate with thin lenses of clear ice; the layers are curved
 * upwards where the ice is thick, and the ice lenses widen steadily.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the ice grows (the lenses widen) (integrated)
 *   audioSpread  -> the number of layers (smoothed)
 *
 * Knobs: sizeP (the layer thickness), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float N = 8.0 + 10.0 * (1.0 - clamp(sizeP, 0.0, 1.0)) + 4.0 * clamp(audioSpread, 0.0, 1.0);
    float g = 0.01 * audioAdvance + 0.012 * sceneTime;
    float heave = 0.08 * sin(2.0 * p.x + 0.3) + 0.05 * sin(5.0 * p.x - 1.0) + 0.08 * fbm(vec2(p.x * 3.0, 1.0));
    float y = (p.y - heave * (0.5 + 0.5 * sin(0.2 * g * 20.0 + p.y * 3.0))) * N;
    float k = floor(y);
    float fy = fract(y);
    float hh = hash21(vec2(k, 5.0));
    float ice = 0.18 + 0.12 * hh + 0.15 * (0.5 + 0.5 * sin(6.2831853 * g + k));
    vec3 c = imgLod(vec2(p.x * 0.85 + 0.5, k / N * 0.85 + 0.5), 1.5);
    c = mix(vec3(luma(c)), c, 1.3);
    vec3 soil = mix(vec3(0.3, 0.22, 0.15), c, 0.6) * (0.85 + 0.3 * noise2(vec2(p.x * 80.0, y * 20.0)));
    float lens = smoothstep(1.0 - ice, 1.0 - ice + 0.05, fy);
    vec3 iceCol = vec3(0.8, 0.92, 1.0) * (0.75 + 0.35 * noise2(vec2(p.x * 40.0, y * 8.0)));
    vec3 col = mix(soil, iceCol, lens * 0.9);
    col *= 0.9 + 0.1 * smoothstep(0.0, 0.05, fy);
    finish(col * 1.15);
}
