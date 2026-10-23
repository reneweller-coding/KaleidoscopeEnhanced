//@doc
 * @brief BLUE NOISE DISSOLVE: a blue-noise threshold (evenly scattered grains): the photo appears out of grains that spread more evenly than white noise would, the threshold sweeping over the
 * picture in a slow wave so that now one half, now the other is solid and the rest a scatter of the photo's own colour dots on a dimmed ground.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the threshold (how much of the photo has appeared)
 *   audioRoughness  -> the grain's size
 *   audioAdvance    -> the wave sweeps (integrated)
 *
 * Knobs: grainP (the base grain size), hueP.
//@params grainP
//@audio audioSwell audioRoughness
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = sceneTime * 0.15 + 1.0 * audioAdvance;
    float g = 1.0 + 2.5 * clamp(grainP, 0.0, 1.0) + 2.0 * clamp(audioRoughness, 0.0, 1.0);
    vec2 q = floor(gl_FragCoord.xy / g);
    float ign = fract(52.9829189 * fract(dot(q, vec2(0.06711056, 0.00583715))));
    float wave = 0.5 + 0.5 * sin(2.0 * p.x + 1.3 * p.y - 0.5 * t);
    float amount = clamp(0.25 + 0.5 * clamp(audioSwell, 0.0, 1.0) + 0.45 * (wave - 0.5), 0.0, 1.0);
    float on = smoothstep(ign - 0.04, ign + 0.04, amount);
    vec3 c = imgLod(uv, 0.5);
    vec3 col = mix(imgLod(uv, 3.0) * 0.5, c, on);
    finish(col * 1.05);
}
