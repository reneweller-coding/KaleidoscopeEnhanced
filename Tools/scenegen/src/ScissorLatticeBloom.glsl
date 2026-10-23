//@doc
 * @brief SCISSOR LATTICE BLOOM: a scissor lattice (lazy tongs) that opens and closes: a grid of rhombi whose sides stay the same length while their angle changes, so that the lattice widens as it flattens and narrows as it rises, and a wave
 * of bending runs through the hinges; every rhombus shows the photo (stretched with the rhombus), the hinges are small bright pins.  The opening follows the swell of the music, the wave of the hinges the bar, once through it.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the opening of the lattice (the angle of the rhombi)
 *   audioBarPhase   -> the wave runs through the hinges once a bar
 *
 * Knobs: sizeP (the size of the rhombi), hueP.
//@params sizeP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float bar = rhyBar();
    float s = 0.34 - 0.16 * clamp(sizeP, 0.0, 1.0);
    vec2 q = p + 0.025 * vec2(sin(5.0 * p.y - 6.2831853 * bar), cos(5.0 * p.x - 6.2831853 * bar));
    float al = 0.8 + 0.25 * sin(0.3 * sceneTime) + 0.3 * (clamp(audioSwell, 0.0, 1.0) - 0.5);
    float a = s * cos(al), b = s * sin(al);
    vec2 uvl = vec2(q.x / a, q.y / b);
    float p1 = (uvl.x + uvl.y) * 0.5, p2 = (uvl.x - uvl.y) * 0.5;
    vec2 cellI = vec2(floor(p1), floor(p2));
    vec2 f = vec2(fract(p1), fract(p2));
    vec2 uv = vec2(0.5) + (f - 0.5) * 0.7 * vec2(a, b) * 6.0 + 0.1 * vec2(sin(cellI.x * 1.7), cos(cellI.y * 2.3));
    vec3 c = imgLod(uv, 0.8);
    float edge = smoothstep(0.0, 0.05, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    vec2 hv = abs(f - 0.5) - 0.5;
    float pin = smoothstep(0.1, 0.0, length(f - vec2(0.0, 0.0))) + smoothstep(0.1, 0.0, length(f - vec2(1.0, 0.0))) + smoothstep(0.1, 0.0, length(f - vec2(0.0, 1.0))) + smoothstep(0.1, 0.0, length(f - vec2(1.0, 1.0)));
    finish(c * (0.45 + 0.55 * edge) * 1.1 + 0.5 * pin * vec3(1.0, 0.95, 0.85));
}
