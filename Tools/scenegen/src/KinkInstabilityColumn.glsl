//@doc
 * @brief KINK INSTABILITY COLUMN: a bundle of plasma columns standing side by side, each kinking into a glowing helix and
 * straightening again -- the kink instability of a current-carrying plasma -- the columns out of step with one another,
 * kinking further as the music swells.  A column is a vertical thread displaced into a helix whose radius rises and
 * falls on its own slow beat; seen from the side it is a sine, brighter where it passes in front, with a hot core and a
 * soft sheath.  The light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> how far the columns kink
 *   audioAdvance -> the helices turn and each column's kink rises and falls on its own beat (integrated)
 *
 * Knobs: columnP (how many columns), turnP (how tightly the kinks wind), hueP.
//@params columnP turnP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float N = floor(5.0 + 3.0 * clamp(columnP, 0.0, 1.0));
    float k = 6.0 + 8.0 * clamp(turnP, 0.0, 1.0);
    float sw = clamp(audioSwell, 0.0, 1.0);
    float run = 0.2 * sceneTime + 0.8 * audioAdvance;
    vec3 col = famCol(fh, 0.45) * 0.015;
    for (int i = 0; i < 8; ++i) {
        float fi = float(i);
        if (fi >= N) break;
        float hi = fract(sin(fi * 12.9898) * 43758.5453);
        float x0 = 1.65 * ((fi + 0.5) / N - 0.5);
        float A = (0.01 + 0.07 * sw) * (0.55 + 0.45 * sin(0.5 * run + 1.3 * fi + 6.0 * hi));
        float ph = k * p.y - run * (0.8 + 0.4 * hi) + 6.2831853 * hi;
        float off = A * cos(ph), front = 0.5 + 0.5 * sin(ph);
        float slope = A * k * sin(ph);
        float d = abs(p.x - x0 - off) / sqrt(1.0 + slope * slope);
        float core = exp(-pow(d / 0.003, 2.0)), sheath = exp(-d / 0.02);
        col += mix(famLight(fh, 0.3 + 0.4 * hi, 0.5), vec3(1.0), 0.35 * core) * (core + 0.3 * sheath) * (0.4 + 0.6 * front);
    }
    finish(col);
}
