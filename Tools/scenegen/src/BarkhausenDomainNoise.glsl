//@doc
 * @brief BARKHAUSEN DOMAIN NOISE: Barkhausen noise: when magnetising, domains flip abruptly; the picture shows domain walls that run across the photo and stick on obstacles, in soft steps.  The wall positions are the level lines of a coordinate bent by the photo's brightness (the obstacles) and pushed on by a driving
 * field that rises in soft stairs; the two kinds of domain are tinted warm and cool.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the field: how fast the staircase climbs
 *   audioAdvance -> the field's stairs run on (integrated)
 *
 * Knobs: sizeP (the number of walls), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float N = 3.0 + 4.0 * clamp(sizeP, 0.0, 1.0);
    vec3 c = imgLod(p * 0.85 + 0.5, 1.2);
    float obs = luma(c) - 0.5;
    float u = (0.05 * audioAdvance + 0.03 * sceneTime) * (0.4 + 1.2 * clamp(audioSwell, 0.0, 1.0));
    float stair = floor(u) + smoothstep(0.55, 0.95, fract(u));
    float s = p.x * N + 1.4 * obs + 0.6 * fbm(vec2(p.y * 3.0, 0.3)) - stair * 0.6 * N * 0.25;
    float fr = fract(s * 0.5);
    float dom = smoothstep(0.45, 0.55, fr) - smoothstep(0.95, 1.0, fr) * 0.0;
    float dom2 = smoothstep(0.0, 0.05, fr) * (1.0 - smoothstep(0.45, 0.5, fr));
    float side = clamp(smoothstep(0.0, 0.03, fr) * (1.0 - smoothstep(0.47, 0.5, fr)) + 0.0, 0.0, 1.0);
    float wall = exp(-pow(fr / 0.02, 2.0)) + exp(-pow((fr - 0.5) / 0.02, 2.0));
    vec3 warm = c * vec3(1.2, 1.0, 0.8);
    vec3 cool = c * vec3(0.8, 0.95, 1.25);
    vec3 col = mix(cool, warm, side);
    col += vec3(1.0, 0.95, 0.85) * wall * 0.5;
    finish(col * 1.1);
}
