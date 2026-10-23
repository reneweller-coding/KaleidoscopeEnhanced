//@doc
 * @brief PILLOWCASE SEAM WALK: a pillowcase as an orbifold: four corners with half-turns, the photo like a mirror image in every corner: the plane is tiled by copies of the photo in which the neighbours are turned half way round,
 * upright and upside down like a chequerboard of copies, and at each lattice corner the cone point glows softly, where the half-turn is fixed.  The corners wander with the phase of the music, the cell size breathes with the swell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the corners wander (integrated)
 *   audioSwell      -> the size of the cells breathes
 *
 * Knobs: sizeP (the size of the cells), hueP.
//@params sizeP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.5 + 0.7 * clamp(sizeP, 0.0, 1.0) + 0.05 * clamp(audioSwell, 0.0, 1.0);
    float t = 0.03 * sceneTime + 0.1 * audioPhase;
    vec2 off = 0.25 * S * vec2(sin(t), sin(1.2 * t + 1.0));
    vec2 q = (p + off) / S;
    vec2 cell = floor(q + 0.5);
    vec2 f = q - cell;
    float par = mod(cell.x + cell.y, 2.0);
    vec2 g = par < 0.5 ? f : -f;
    vec3 c = imgLod(g * S * 0.8 + 0.5, 0.7);
    vec2 corner = abs(f) - 0.5;
    float cp = exp(-dot(corner, corner) / (0.0016 / (S * S)));
    float seam = smoothstep(0.0, 0.02 / S, 0.5 - max(abs(f.x), abs(f.y)));
    finish(c * (0.8 + 0.2 * seam) * 1.08 + 0.6 * cp * vec3(1.0, 0.95, 0.8));
}
