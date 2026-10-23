//@doc
 * @brief NEON SPREAD DISCS: neon colour spreading: a lattice of thin black crossed lines on a bright ground, and in discs scattered over it the lines are coloured instead of black: the colour seems to spill out of the lines
 * and fill every disc as a pale, glowing, transparent disc that is not there.  The colours are the photo's saturated colours at the discs' places.  The line thickness (how much colour there is to spread) follows the swell,
 * the lattice turns slowly with the phase of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the thickness of the lines
 *   audioPhase      -> the lattice turns (integrated)
 *
 * Knobs: gridP (the lattice's fineness), hueP.
//@params gridP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float t = 0.02 * sceneTime + 0.1 * audioPhase;
    vec2 q = rot2(0.2 * sin(t)) * p;
    float s = 0.5;
    vec2 cell = floor(q / s + 0.5);
    vec2 dc = q - cell * s;
    float rd = 0.18 + 0.05 * hash21(cell);
    float inDisc = smoothstep(0.008, -0.008, length(dc) - rd);
    float N = 22.0 + 22.0 * clamp(gridP, 0.0, 1.0);
    vec2 f = abs(fract(q * N) - 0.5);
    float th = 0.06 + 0.07 * clamp(audioSwell, 0.0, 1.0);
    float line = max(smoothstep(th, th - 0.03, f.x), smoothstep(th, th - 0.03, f.y));
    vec3 pc = imgLod(cell * s * 0.8 + 0.5, 3.0);
    pc = clamp(mix(vec3(luma(pc)), pc, 2.5), 0.0, 1.0);
    pc *= 0.9 / max(max(pc.r, max(pc.g, pc.b)), 0.2);
    vec3 bg = mix(imgLod(p * 0.8 + 0.5, 4.5), vec3(1.0), 0.7);
    vec3 lc = mix(vec3(0.05), pc, inDisc);
    finish(mix(bg, lc, line));
}
