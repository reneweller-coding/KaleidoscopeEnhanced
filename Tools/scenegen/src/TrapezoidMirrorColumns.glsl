//@doc
 * @brief TRAPEZOID MIRROR COLUMNS: upright mirror columns of trapezoid section: the photo is mirrored in broken fans, every column tilted at its own angle,
 * the angles turning as the columns glide past; the number of columns follows the key.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the columns glide and their tilts turn (integrated)
 *   audioHarmAdvance -> the number of columns (blended, integrated)
 *
 * Knobs: columnsP (the base number), tiltP (how far the columns tilt), hueP.
//@params columnsP tiltP
//@audio audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.15 + 1.2 * audioAdvance;
    float N = 5.0 + 9.0 * clamp(columnsP, 0.0, 1.0) + 1.5 * sin(0.4 * audioHarmAdvance);
    float x = p.x * N * 0.6 + 0.3 * t;
    float i = floor(x);
    float f = fract(x) - 0.5;
    float tilt = (0.3 + 0.9 * clamp(tiltP, 0.0, 1.0)) * sin(0.5 * t + 1.9 * i);
    float sg = mod(i, 2.0) < 0.5 ? 1.0 : -1.0;
    vec2 l = vec2(f * sg, p.y);
    vec2 uv = rot2(tilt) * l * vec2(0.9, 0.8) + 0.5 + vec2(0.17 * (hash21(vec2(i, 1.0)) - 0.5), 0.0);
    vec3 col = imgLod(uv, 0.5) * (0.8 + 0.3 * (0.5 + 0.5 * sin(tilt * 2.0 + 1.0 * sg)));
    col *= 1.0 - 0.2 * smoothstep(0.42, 0.5, abs(f));
    finish(col * 1.05);
}
