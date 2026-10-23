//@doc
 * @brief PERFORATED PLATE LIGHT: perforated sheet metal in front of a light: the hole's size follows the brightness, the photo shines through the holes in its own colours, and the plate slides
 * over it, so the picture is made of the light that passes and the metal's dark between.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the holes' size
 *   audioAdvance    -> the plate slides (integrated)
 *
 * Knobs: gridP (the holes' pitch), hueP.
//@params gridP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = 0.04 * sceneTime + 0.3 * audioAdvance;
    float N = 26.0 + 34.0 * clamp(gridP, 0.0, 1.0);
    vec2 q = p * N + vec2(0.5 * sin(t), 0.3 * cos(0.8 * t)) * 3.0;
    vec2 cell = floor(q);
    vec2 f = fract(q) - 0.5;
    vec3 c = imgLod(uv, 1.5);
    float r = (0.18 + 0.28 * luma(c)) * (0.8 + 0.4 * clamp(audioSwell, 0.0, 1.0));
    float hole = smoothstep(r, r * 0.8, length(f));
    vec3 metal = vec3(0.12, 0.12, 0.13) * (0.7 + 0.6 * hash21(cell)) * (0.8 + 0.2 * smoothstep(0.5, 0.2, length(f)));
    vec3 col = mix(metal, imgLod(uv, 0.4) * 1.35, hole);
    finish(col);
}
