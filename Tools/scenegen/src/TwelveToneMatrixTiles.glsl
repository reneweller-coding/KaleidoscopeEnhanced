//@doc
 * @brief TWELVE TONE MATRIX TILES: the matrix of twelve-tone music: a 12x12 matrix of row, inversion, retrograde and retrograde inversion; every cell is a pitch, and the photo appears in movements of rows and columns that mirror each other.  Each cell shows the photo at an offset that
 * belongs to its pitch, the quadrants are mirrored about an axis, and the rows scroll on slowly so the series seems to rotate.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the rows scroll (the series rotates) (integrated)
 *   audioAdvance     -> the mirror axis wanders
 *
 * Knobs: sizeP (the size of the cells), hueP.
//@params sizeP
//@audio audioAdvance audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float ax = 0.18 * sin(0.02 * audioAdvance + 0.03 * sceneTime);
    vec2 m = vec2(abs(p.x - ax) , abs(p.y));
    float n = 6.0 + 3.0 * (1.0 - clamp(sizeP, 0.0, 1.0));
    float cs = 0.5 / n * 2.0 * 0.5;
    vec2 g = vec2(m.x / cs + 0.03 * audioHarmAdvance, m.y / cs - 0.04 * audioHarmAdvance - 0.03 * sceneTime);
    vec2 ci = floor(g);
    vec2 f = fract(g);
    float pc = mod(5.0 * ci.x * ci.x + 7.0 * ci.y + 3.0 * ci.x * ci.y + ci.x, 12.0);
    float ang = 6.2831853 * pc / 12.0;
    vec2 uv = (f - 0.5) * 0.35 + 0.5 + vec2(0.08 * cos(ang), 0.08 * sin(ang)) + 0.35 * vec2(ci.x * 0.0, 0.0);
    vec2 cell = vec2(ci.x * cs - 0.03 * audioHarmAdvance * cs, 0.0);
    vec3 c = imgLod(uv + 0.1 * vec2(sin(ci.x), cos(ci.y)), 1.0);
    vec3 c2 = imgLod(vec2(ci.x * cs, ci.y * cs) * 0.5 + 0.5 + f * 0.04, 1.2);
    vec3 col = mix(c, c2, 0.4);
    col *= 0.6 + 0.5 * cos(ang);
    float edge = smoothstep(0.0, 0.06, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    float axis = 1.0 - smoothstep(0.0, 0.006, abs(p.x - ax));
    finish(col * (0.3 + 0.7 * edge) * 1.25 + axis * vec3(0.3));
}
