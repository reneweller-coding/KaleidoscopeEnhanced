//@doc
 * @brief BANDED IRON RHYTHM: banded iron formation: layers of iron oxide and silica in turn, with fine bands within bands; the photo colours the layers, and a beat of thicknesses wanders through the stack.  The layer coordinate is a sum of three scales (thick, medium, fine) whose weights follow a slow rhythm; the
 * ratio of thick to thin follows the key.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the ratio of thick to thin layers (integrated)
 *   audioAdvance     -> the rhythm wanders through the stack (integrated)
 *
 * Knobs: sizeP (the number of layers), hueP.
//@params sizeP
//@audio audioAdvance audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float N = 10.0 + 14.0 * clamp(sizeP, 0.0, 1.0);
    float t = 0.02 * audioAdvance + 0.03 * sceneTime;
    float rat = 0.5 + 0.5 * sin(0.05 * audioHarmAdvance + 0.02 * sceneTime);
    float warp = 0.15 * fbm(vec2(p.x * 1.5, p.y * 0.5 + 0.1 * t)) + 0.04 * sin(3.0 * p.x + t);
    float y = p.y + warp;
    float s1 = y * N;
    float s2 = y * N * 3.1 + 0.8 * sin(0.7 * s1 + t);
    float s3 = y * N * 11.0 + 1.5 * sin(1.3 * s2);
    float b1 = smoothstep(0.35, 0.65, 0.5 + 0.5 * sin(6.2831853 * s1 * 0.5 + 6.0 * rat));
    float b2 = smoothstep(0.3, 0.7, 0.5 + 0.5 * sin(6.2831853 * s2 * 0.5));
    float b3 = 0.5 + 0.5 * sin(6.2831853 * s3 * 0.5);
    float v = mix(b1, b2, 0.35 + 0.3 * rat) * 0.8 + 0.2 * b3;
    vec3 c = imgLod(vec2(p.x * 0.85 + 0.5, floor(s1) / N * 0.85 + 0.5 + 0.0), 1.5);
    c = mix(vec3(luma(c)), c, 1.3);
    vec3 iron = mix(vec3(0.25, 0.08, 0.05), c * vec3(1.1, 0.7, 0.55), 0.55);
    vec3 silica = mix(vec3(0.85, 0.8, 0.72), c, 0.35);
    vec3 col = mix(iron, silica, v);
    col *= 0.9 + 0.2 * noise2(vec2(p.x * 60.0, p.y * 200.0));
    finish(col * 1.15);
}
