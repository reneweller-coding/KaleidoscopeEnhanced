//@doc
 * @brief HERMANN GRID PHOTO: Hermann's grid: dark blocks cut from the photo with bright lanes between them; at the crossings of the lanes grey ghosts show that are not there, and run away from the eye.  The lanes sway very gently
 * through the picture in a slow wave so that the ghosts are never still, and their width follows the swell of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the width of the lanes
 *   audioAdvance    -> the slow sway of the lattice (integrated)
 *
 * Knobs: gridP (the size of the blocks), hueP.
//@params gridP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float s = 0.34 - 0.18 * clamp(gridP, 0.0, 1.0);
    float t = 0.02 * sceneTime + 0.1 * audioAdvance;
    vec2 q = p + 0.02 * vec2(sin(3.0 * p.y + t * 3.0), cos(3.0 * p.x - t * 2.0));
    vec2 f = abs(fract(q / s + 0.5) - 0.5) * s;
    float lane = 0.016 + 0.024 * clamp(audioSwell, 0.0, 1.0);
    float inLane = max(smoothstep(lane + 0.004, lane - 0.004, f.x), smoothstep(lane + 0.004, lane - 0.004, f.y));
    vec3 c = imgLod(p * 0.8 + 0.5, 0.8);
    finish(mix(c * 0.4, vec3(0.97), inLane));
}
