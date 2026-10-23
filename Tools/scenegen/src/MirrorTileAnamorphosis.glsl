//@doc
 * @brief MIRROR TILE ANAMORPHOSIS: a field of curved mirror tiles -- cylinder, cone and sphere in turn: the photo is unfolded differently from every viewpoint; where the mirrors stand
 * right (the curvature passes the value that undoes the distortion) the picture snaps together, tile by tile in a wave, and then falls apart again.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the curvature of the mirrors
 *   audioHarmAdvance -> the wave in which the tiles come right moves with the harmony (continuous)
 *
 * Knobs: cellsP (how many tiles), hueP.
//@params cellsP
//@audio audioSwell audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float N = 3.0 + 4.0 * clamp(cellsP, 0.0, 1.0);
    vec2 q = p * N;
    vec2 cell = floor(q);
    vec2 f = fract(q) - 0.5;
    float kind = mod(cell.x + 2.0 * cell.y, 3.0);
    float cur = 0.15 + 0.85 * (0.5 + 0.5 * sin(0.4 * audioHarmAdvance - 0.9 * cell.x - 0.7 * cell.y + 2.0 * clamp(audioSwell, 0.0, 1.0)));
    float right = exp(-pow((cur - 0.5) / 0.12, 2.0));
    vec2 base = (cell + 0.5) / N * 0.8 + 0.5;
    vec2 d = f * 2.0;
    vec2 refl;
    if (kind < 0.5) refl = vec2(d.x * (1.0 + 1.4 * cur), d.y * 0.4);
    else if (kind < 1.5) { float r = length(d); refl = d / max(r, 0.05) * r * r * (1.0 + 1.6 * cur); }
    else refl = d * (1.0 + 1.2 * cur) / (1.0 + 0.8 * dot(d, d));
    vec2 ideal = d * 0.55;
    vec2 uv = base + mix(refl, ideal, right) * 0.5 / N * 3.0;
    vec3 col = imgLod(uv, 0.5) * (0.7 + 0.45 * (1.0 - dot(d, d) * 0.25));
    col *= 1.0 - 0.2 * smoothstep(0.42, 0.5, max(abs(f.x), abs(f.y)));
    finish(col * (1.0 + 0.1 * right));
}
