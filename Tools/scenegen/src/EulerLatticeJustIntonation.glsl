//@doc
 * @brief EULER LATTICE JUST INTONATION: an Euler lattice of just tuning: one axis is fifths, the other pure thirds, and every lattice point is a pure note; the photo is spread over a rhombic tiling in which neighbours are harmonic.  Each rhomb takes the photo's colour at its own place and a
 * brightness from its pitch class, and the net turns with the key.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the net turns (integrated)
 *   audioSwell       -> the cell size breathes
 *
 * Knobs: sizeP (the cell size), hueP.
//@params sizeP
//@audio audioSwell audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = (0.07 + 0.07 * clamp(sizeP, 0.0, 1.0)) * (1.0 + 0.2 * clamp(audioSwell, 0.0, 1.0));
    vec2 q = rot2(0.05 * audioHarmAdvance + 0.03 * sceneTime) * p / S;
    vec2 e1 = vec2(1.0, 0.0);
    vec2 e2 = vec2(0.42, 0.907);
    float det = e1.x * e2.y - e1.y * e2.x;
    vec2 uv = vec2((q.x * e2.y - q.y * e2.x) / det, (-q.x * e1.y + q.y * e1.x) / det);
    vec2 ci = floor(uv);
    vec2 f = fract(uv);
    float pc = mod(7.0 * ci.x + 4.0 * ci.y, 12.0);
    vec2 cen = (ci.x + 0.5) * e1 + (ci.y + 0.5) * e2;
    vec2 pcen = rot2(-(0.05 * audioHarmAdvance + 0.03 * sceneTime)) * (cen * S);
    vec3 c = imgLod(pcen * 0.85 + 0.5, 1.2);
    float br = 0.65 + 0.4 * cos(6.2831853 * pc / 12.0);
    float edge = smoothstep(0.0, 0.06, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    float dot_ = 1.0 - smoothstep(0.1, 0.18, length(f));
    finish(c * br * (0.35 + 0.65 * edge) * 1.25 + dot_ * 0.1);
}
