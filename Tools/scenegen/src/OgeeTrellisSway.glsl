//@doc
 * @brief OGEE TRELLIS SWAY: an ogee lattice: onion arches in a grid, as in mashrabiya and wallpaper; the arches sway slightly as if in the wind, and the photo shines through the spaces between.  The lattice is the union of four circles per cell, sheared sideways by a slow wave, drawn as a gold bar,
 * with the photo glowing in the openings.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the swaying of the lattice
 *   audioAdvance -> the sway's wave runs on (integrated)
 *
 * Knobs: sizeP (the size of the cells), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.2 + 0.14 * clamp(sizeP, 0.0, 1.0);
    float sw = (0.08 + 0.2 * clamp(audioSwell, 0.0, 1.0)) * sin(1.6 * p.y + 0.06 * audioAdvance + 0.1 * sceneTime);
    vec2 q = vec2(p.x + sw * p.y * 0.0 + sw * 0.5, p.y) / S;
    vec2 f = fract(q) - 0.5;
    float d = 1e3;
    for (int i = 0; i < 4; ++i) {
        vec2 c = vec2((i & 1) == 0 ? -0.5 : 0.5, (i & 2) == 0 ? -0.5 : 0.5);
        d = min(d, abs(length(f - c) - 0.5));
    }
    float bar = 1.0 - smoothstep(0.025, 0.05, d);
    float hl = 1.0 - smoothstep(0.0, 0.015, abs(d - 0.02));
    vec3 c = imgLod(p * 0.85 + 0.5, 0.5);
    vec3 gold = vec3(1.0, 0.8, 0.4) * (0.7 + 0.4 * luma(imgLod(p * 0.85 + 0.5, 2.0)));
    vec3 col = c * (0.85 + 0.3 * smoothstep(0.1, 0.5, d)) * (1.0 - bar);
    col = mix(col, gold, bar) + hl * vec3(1.0, 0.95, 0.8) * 0.2;
    finish(col * 1.1);
}
