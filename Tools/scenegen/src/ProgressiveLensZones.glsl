//@doc
 * @brief PROGRESSIVE LENS ZONES: a varifocal spectacle lens over the photo: far at the top, near at the bottom, between them a corridor of clear sight at whose sides
 * the picture swims and bends in soft zones; the glass glides and tilts over the picture.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the corridor's width
 *   audioPhase      -> the glass glides and tilts (integrated)
 *
 * Knobs: powerP (the addition: how much the near zone magnifies), hueP.
//@params powerP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.1 + 0.8 * audioPhase;
    vec2 c = 0.25 * vec2(sin(0.7 * t), cos(0.5 * t));
    vec2 d = p - c;
    float cw = 0.14 + 0.2 * clamp(audioSwell, 0.0, 1.0);
    float yy = d.y;
    float zoom = mix(0.9, 0.9 - 0.55 * clamp(powerP + 0.3, 0.0, 1.0), smoothstep(0.3, -0.3, yy));
    float corridor = cw + 0.25 * (0.5 - 0.5 * clamp(yy * 2.0, -1.0, 1.0));
    float side = smoothstep(corridor * 0.7, corridor * 1.7, abs(d.x));
    float lens = smoothstep(0.55, 0.3, length(vec2(d.x * 0.8, d.y)));
    vec2 off = vec2(0.35 * side * d.x * abs(d.x) * 2.0 + 0.06 * side * d.y, 0.06 * side * d.x);
    vec2 pp = mix(p, c + d * zoom + off, lens);
    vec3 col = imgLod(pp * 0.8 + 0.5, 0.4);
    float edge = lens * (1.0 - lens) * 4.0;
    col *= 1.0 - 0.15 * edge;
    col += 0.08 * edge * vec3(1.0);
    finish(col * 1.05);
}
