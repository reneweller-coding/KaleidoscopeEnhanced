//@doc
 * @brief BIRKELAND FILAMENT PAIRS: twisted current filaments in a plasma: pairs of glowing threads wound round each
 * other, standing in columns across the picture, each pair's axis swaying, the threads twisting along it and drawing
 * together until they merge as the music swells.  A thread wound round its pair's axis is a helix; seen from the side
 * it is a sine of the twist, brighter where it passes in front; its glow has a hot core and a soft haze, and the pair
 * sits in a faint plasma column.  The light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the threads twist (integrated) and the axes sway
 *   audioSwell   -> the pairs draw together and merge
 *
 * Knobs: pairP (how many pairs), twistP (how tightly they twist), hueP.
//@params pairP twistP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float N = floor(4.0 + 3.0 * clamp(pairP, 0.0, 1.0));
    float k = 9.0 + 9.0 * clamp(twistP, 0.0, 1.0);
    float run = 0.3 * sceneTime + 1.2 * audioAdvance;
    float sway = 0.02 * sceneTime + 0.08 * audioAdvance;
    float sep = 0.045 * (1.0 - 0.8 * clamp(audioSwell, 0.0, 1.0)) + 0.004;
    vec3 col = famCol(fh, 0.45) * 0.015;
    for (int i = 0; i < 7; ++i) {
        float fi = float(i);
        if (fi >= N) break;
        float hi = fract(sin(fi * 12.9898) * 43758.5453);
        float x0 = 1.7 * ((fi + 0.5) / N - 0.5);
        float ax = x0 + 0.05 * sin(1.7 * p.y + sway + 6.0 * hi) + 0.03 * sin(3.1 * p.y - 0.7 * sway + fi);
        float dx = p.x - ax;
        if (abs(dx) > 0.2) continue;
        col += famCol(fh, 0.4 + 0.2 * hi) * 0.06 * exp(-dx * dx / 0.004);                  // the plasma column
        for (int j = 0; j < 2; ++j) {
            float ph = k * p.y - run * (0.8 + 0.4 * hi) + 3.14159265 * float(j) + 6.2831853 * hi;
            float off = sep * cos(ph), front = 0.5 + 0.5 * sin(ph);
            float slope = sep * k * sin(ph);
            float d = abs(dx - off) / sqrt(1.0 + slope * slope);
            float core = exp(-pow(d / 0.0025, 2.0)), haze = exp(-d / 0.015);
            col += mix(famLight(fh, 0.3 + 0.4 * hi, 0.5), vec3(1.0), 0.4 * core) * (core + 0.3 * haze) * (0.35 + 0.65 * front);
        }
    }
    finish(famExpose(col, 3.78, 0.90, 0.00, fh));
}
