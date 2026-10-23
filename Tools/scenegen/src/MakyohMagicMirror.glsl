//@doc
 * @brief MAKYOH MAGIC MIRROR: the magic mirror: an almost flat metal surface whose tiny curvature holds the photo throws a spot of light on the wall in which the picture appears
 * without ever having been painted; the surface is bent by hand, the lamp moves, and the picture swells and fades as the curvature passes through the right shape.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the bending (the picture sharpens as the curvature closes)
 *   audioPhase      -> the lamp moves (integrated)
 *
 * Knobs: bendP (the base curvature), hueP.
//@params bendP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = 0.1 * sceneTime + 0.8 * audioPhase;
    vec2 lamp = 0.3 * vec2(sin(0.6 * t), cos(0.45 * t));
    float e = 0.006;
    float L0 = luma(imgLod(uv, 3.0));
    vec2 g = vec2(luma(imgLod(uv + vec2(e, 0.0), 3.0)) - luma(imgLod(uv - vec2(e, 0.0), 3.0)),
                  luma(imgLod(uv + vec2(0.0, e), 3.0)) - luma(imgLod(uv - vec2(0.0, e), 3.0))) / (2.0 * e);
    float lap = luma(imgLod(uv + vec2(e, 0.0), 3.0)) + luma(imgLod(uv - vec2(e, 0.0), 3.0)) + luma(imgLod(uv + vec2(0.0, e), 3.0)) + luma(imgLod(uv - vec2(0.0, e), 3.0)) - 4.0 * L0;
    float k = (0.4 + 1.4 * clamp(bendP, 0.0, 1.0)) * (0.5 + 0.9 * clamp(audioSwell, 0.0, 1.0));
    float focus = 1.0 + k * 22.0 * lap;
    vec2 uv2 = uv + (lamp * 0.3 + g * 0.01 * k);
    vec3 col = imgLod(uv2, 0.5) * clamp(focus, 0.35, 2.2);
    col = mix(vec3(luma(col)) * 0.8, col, 0.4 + 0.6 * clamp(k, 0.0, 1.0));
    col *= 0.9 + 0.2 * exp(-dot(p - lamp, p - lamp) * 1.5);
    finish(col);
}
