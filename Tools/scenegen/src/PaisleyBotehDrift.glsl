//@doc
 * @brief PAISLEY BOTEH DRIFT: paisley: the drop shape with a curved tip in rows, every drop filled with the photo and edged with small patterns; the drops tip one after the other like a wave.  Each boteh is a round head and a tail that narrows and bends, drawn with a double outline and a row of dots, and
 * the photo shows through the drop in its own colours.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the tilting runs through the rows like a wave (integrated)
 *   audioSwell   -> the swing of the tilt
 *
 * Knobs: sizeP (the size of the drops), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.24 + 0.18 * clamp(sizeP, 0.0, 1.0);
    vec2 q = p / S;
    float row = floor(q.y);
    q.x += 0.5 * mod(row, 2.0);
    vec2 ci = floor(q);
    vec2 f = fract(q) - 0.5;
    float tilt = (0.35 + 0.5 * clamp(audioSwell, 0.0, 1.0)) * sin(0.5 * ci.x + 0.3 * ci.y - 0.06 * audioAdvance - 0.1 * sceneTime);
    vec2 u = rot2(tilt) * f * 1.7;
    u.x -= 0.45 * (u.y + 0.1) * (u.y + 0.1) * sign(0.5);
    float y = u.y;
    float w = y < -0.1 ? sqrt(max(0.1089 - (y + 0.1) * (y + 0.1), 0.0)) : 0.33 * clamp((0.55 - y) / 0.65, 0.0, 1.0);
    float d = abs(u.x) - w;
    float inside = 1.0 - smoothstep(-0.01, 0.01, d);
    float ring = 1.0 - smoothstep(0.0, 0.025, abs(d + 0.05));
    float dots = (1.0 - smoothstep(0.0, 0.03, length(vec2(fract(u.y * 9.0) - 0.5, 0.0)) * 0.12 + abs(d + 0.11))) * step(-0.28, y);
    vec3 c = imgLod(p * 0.85 + 0.5, 0.6);
    vec3 bg = imgLod(p * 0.85 + 0.5, 2.5) * 0.2 + vec3(0.02, 0.02, 0.04);
    vec3 col = mix(bg, c * 1.15, inside);
    col = mix(col, vec3(1.0, 0.85, 0.5), ring * inside * 0.8);
    col = mix(col, vec3(1.0, 0.9, 0.7), dots * inside * 0.7);
    float outl = 1.0 - smoothstep(0.0, 0.02, abs(d));
    col = mix(col, vec3(0.95, 0.8, 0.45), outl * 0.9);
    finish(col);
}
