//@doc
 * @brief WANG TILE STOCHASTIC FLOOR: Wang tiles: a set of tiles with matching edges that make a floor without repetition; the photo is divided into sixteen tiles, and their arrangement is shuffled anew slowly, so that the floor wanders.  Every floor cell shows one of the sixteen pieces of the photo; at each shuffle the
 * pieces change by a cross-fade, each cell with its own time.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread  -> the size of the tiles (smoothed)
 *   audioAdvance -> the shuffling runs on (integrated)
 *
 * Knobs: sizeP (the size of the tiles), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
vec3 tilePick(vec2 ci, vec2 f, float k)
{
    float idx = floor(hash21(ci + k * 13.7) * 16.0);
    vec2 t = vec2(mod(idx, 4.0), floor(idx / 4.0));
    vec2 uv = (t + f) / 4.0;
    return imgLod(uv * 0.9 + 0.05, 0.7);
}
void main()
{
    vec2 p = screenP();
    float S = (0.16 + 0.14 * clamp(sizeP, 0.0, 1.0)) * (1.0 + 0.25 * clamp(audioSpread, 0.0, 1.0));
    vec2 g = p / S;
    vec2 ci = floor(g);
    vec2 f = fract(g);
    float ph = 0.02 * audioAdvance + 0.03 * sceneTime + 3.0 * hash21(ci);
    float k = floor(ph);
    float w = smoothstep(0.7, 1.0, fract(ph));
    vec3 a = tilePick(ci, f, k);
    vec3 b = tilePick(ci, f, k + 1.0);
    vec3 col = mix(a, b, w);
    float edge = smoothstep(0.0, 0.03, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    finish(col * (0.85 + 0.15 * edge) * 1.1);
}
