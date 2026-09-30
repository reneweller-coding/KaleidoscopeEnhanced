//@doc
 * @brief TEN PRINT MAZE: the famous one-line maze, alive -- every cell holds
 * a diagonal, "/" or "\", and together they form an endless labyrinth;
 * the diagonals slowly rotate from one to the other in waves (cross-faded
 * smoothly, never jumping), so corridors open and close across the maze;
 * the lines glow in the photograph's colours, and pulses of light race
 * along them.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flip waves and the pulses (integrated, jump-free)
 *   audioSpread     -> the flip waves spread
 *   audioKick       -> the pulses flare (light)
 *   audioMode       -> glowing lines on black in minor, dark lines on light in major (blend)
 *   audioRoughness  -> line width varies
 *   audioSwell      -> the photo in the cells (slow)
 *
 * Knobs: cellP (cell size), lineP (line width), photoP (photo colours), hueP.
//@params cellP lineP photoP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = smoothstep(0.3, 0.7, clamp(audioMode, 0.0, 1.0));
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float S = 8.0 + 12.0 * (1.0 - clamp(cellP, 0.0, 1.0));
    vec2 g = p * S + vec2(0.1, 0.05) * sceneTime;
    vec2 gi = floor(g);
    vec2 f = fract(g);
    float T = 0.2 * sceneTime + 1.2 * audioAdvance;
    float w = (0.05 + 0.08 * clamp(lineP, 0.0, 1.0)) * (1.0 + rough * 0.5 * (fbm3(p * 3.0) - 0.5));
    float px = fwidth(g.x) * 1.2;
    // Lines of this cell and its neighbours (segments with round ends, so the
    // maze's corridors join without gaps); each cell's diagonal is a cross-fade
    // of both orientations driven by a slow wave.
    float line = 0.0, dmin = 1e3, along = 0.0;
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 c = gi + vec2(i, j);
        float wave = sin(dot(c, vec2(0.21, 0.13)) * (1.0 + clamp(audioSpread, 0.0, 1.0)) - T + hash21(c) * 2.0);
        float o = smoothstep(-0.3, 0.3, wave);
        float d1 = sdSeg(g, c, c + 1.0);
        float d2 = sdSeg(g, c + vec2(1.0, 0.0), c + vec2(0.0, 1.0));
        float lc = mix(smoothstep(w + px, w - px, d1), smoothstep(w + px, w - px, d2), o);
        if (lc > line) { line = lc; along = dot(g - c, mix(vec2(0.5), vec2(0.5, -0.5), o)) + dot(c, vec2(0.5)); }
        dmin = min(dmin, mix(d1, d2, o));
    }
    // Pulses along the lines.
    float pulse = pow(max(0.0, sin(along * 3.0 - T * 3.0)), 12.0);
    vec2 uv = p * 0.5 + 0.5;                                   // continuous: no cell checker
    vec3 ph = imgLod(uv, 2.0);
    vec3 lc = glowColour(ph, p * 2.0, hueP * 0.159);
    vec3 glowLines = lc * line * (0.7 + (0.8 + 1.5 * kick) * pulse) + lc * exp(-min(dmin, 0.5) / 0.06) * 0.15;
    vec3 bg = ph * (0.04 + 0.2 * swell * clamp(photoP + 0.3, 0.0, 1.3));
    vec3 dark = glowLines + bg;
    vec3 light = mix(vec3(0.94, 0.92, 0.88) * (0.8 + 0.3 * ph * clamp(photoP, 0.0, 1.0)), lc * 0.25, line) + lc * pulse * line * kick * 0.5;
    finish(mix(dark, light, mode));
}
