//@doc
 * @brief ICE BLOCK MOSAIC: ice cubes in a grid, each with cracks and air bubbles that bend the photo and break it into shards; the cubes melt and freeze anew, each at its own phase:
 * a melting cube shrinks and rounds, and its picture smears; a fresh one is sharp-edged and full of cracks.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the melting (the cubes shrink as it grows)
 *   audioAdvance    -> the melt cycle runs (integrated)
 *
 * Knobs: cellsP (how many cubes), hueP.
//@params cellsP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = 0.04 * sceneTime + 0.3 * audioAdvance;
    float N = 4.0 + 4.0 * clamp(cellsP, 0.0, 1.0);
    vec2 q = p * N;
    vec2 cell = floor(q);
    vec2 f = fract(q) - 0.5;
    float melt = 0.5 + 0.5 * sin(6.2831853 * (t * 0.3 + hash21(cell))) ;
    melt = clamp(melt * 0.6 + 0.4 * clamp(audioSwell, 0.0, 1.0) * 0.8, 0.0, 1.0);
    float size = 0.46 - 0.18 * melt;
    float rnd = melt;
    float sh = pow(pow(abs(f.x), 2.0 + 6.0 * (1.0 - rnd)) + pow(abs(f.y), 2.0 + 6.0 * (1.0 - rnd)), 1.0 / (2.0 + 6.0 * (1.0 - rnd)));
    float cube = smoothstep(size, size * 0.9, sh);
    vec2 g = floor(f * 4.0 + 0.5);
    vec2 sub = hash22(cell * 7.0 + g);
    vec2 crack = (sub - 0.5) * 0.09 * (1.0 - melt);
    vec2 bub = vec2(noise2(f * 9.0 + cell * 3.0), noise2(f * 9.0 + cell * 3.0 + 5.0)) - 0.5;
    vec3 col = imgLod(uv + crack + bub * 0.05, 0.5 + 1.5 * melt);
    float ca = smoothstep(0.02, 0.0, abs(fract(f.x * 4.0 + sub.x) - 0.5) - 0.48) * (1.0 - melt);
    col = col * (0.85 + 0.25 * (1.0 - melt)) + 0.12 * ca;
    vec3 bg = imgLod(uv, 3.0) * 0.42;
    finish(mix(bg, col, cube));
}
