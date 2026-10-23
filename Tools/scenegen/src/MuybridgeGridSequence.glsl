//@doc
 * @brief MUYBRIDGE GRID SEQUENCE: a grid of image fields like Muybridge's series photographs: every field shows the photo at a later moment of its own movement (zoom, turn, shift), and the fields run through time one after another in rows, so the whole grid
 * is one slow movement cut into steps.  The movement is the same in every field, only its moment differs.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the time that passes between fields and the running of the series (integrated)
 *   audioSwell   -> the size of the movement
 *
 * Knobs: sizeP (the number of fields), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float cols = 3.0 + floor(2.99 * clamp(sizeP, 0.0, 1.0));
    float rows = cols - 1.0;
    vec2 g = vec2((p.x / 1.78 + 0.5) * cols, (p.y + 0.5) * rows);
    vec2 ci = floor(g);
    vec2 f = fract(g) - 0.5;
    float idx = ci.y * cols + ci.x;
    float t = 0.05 * audioAdvance + 0.06 * sceneTime - idx * 0.35;
    float A = 0.25 + 0.3 * clamp(audioSwell, 0.0, 1.0);
    float z = 1.0 + A * 0.4 * sin(t);
    float r = A * 0.5 * sin(0.7 * t + 1.0);
    vec2 sh = A * 0.12 * vec2(sin(1.3 * t), cos(0.9 * t));
    vec2 q = rot2(r) * (f * vec2(1.78 / cols * 1.0, 1.0 / rows * 1.0) * 1.0) / z;
    vec2 uv = q * vec2(cols * 0.55, rows * 0.7) + 0.5 + sh;
    vec3 c = imgLod(uv, 0.6);
    float fr = smoothstep(0.0, 0.03, 0.5 - abs(f.x)) * smoothstep(0.0, 0.03, 0.5 - abs(f.y));
    vec3 line = vec3(0.04);
    finish(mix(line, c * 1.15, fr));
}
