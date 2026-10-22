//@doc
 * @brief LASER CAUSTIC LINES: laser fans shine through a glass of water and throw line caustics on the wall: bright thin
 * curves that wriggle as the water's surface moves, crossing and weaving through one another, brightest where the
 * surface's curvature gathers the light.  Each laser is a straight line bent by the surface: its offset at a place is
 * the sum of three travelling waves; where the curve bends hardest the light gathers into brighter knots.  The lines
 * run at several angles over the whole picture, each a white-hot core in a colour of the family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBass    -> the water's waves: the lines wriggle wider with the bass
 *   audioAdvance -> the waves travel (integrated)
 *   audioSwell   -> the lasers' brightness
 *
 * Knobs: lineP (how many lasers), waveP (how fine the waves are), hueP.
//@params lineP waveP
//@audio audioBass audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float N = floor(8.0 + 4.0 * clamp(lineP, 0.0, 1.0));
    float kw = 5.0 + 6.0 * clamp(waveP, 0.0, 1.0);
    float run = 0.2 * sceneTime + 0.8 * audioAdvance;
    float amp = 0.025 + 0.035 * clamp(audioBass, 0.0, 1.0);
    float bright = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = famCol(fh, 0.45) * 0.015;
    for (int i = 0; i < 12; ++i) {
        float fi = float(i);
        if (fi >= N) break;
        float h = fract(sin(fi * 12.9898) * 43758.5453);
        float ang = 3.14159265 * fract(0.618034 * fi + 0.1) + 0.1 * sin(0.05 * sceneTime + fi);
        vec2 dir = vec2(cos(ang), sin(ang)), nrm = vec2(-dir.y, dir.x);
        float u = dot(p, dir), v = dot(p, nrm) - 1.3 * (h - 0.5);
        // the surface's waves bend the line: offset, slope and bend
        float f = 0.0, fp = 0.0, fpp = 0.0;
        for (int k = 0; k < 3; ++k) {
            float fk = float(k);
            float a = amp / (1.0 + fk), kk = kw * (1.0 + 0.7 * fk);
            float ph = kk * u + run * (1.0 + 0.3 * fk) * (mod(fk, 2.0) < 0.5 ? 1.0 : -1.0) + 6.2831853 * fract(h * (3.0 + fk));
            f += a * sin(ph);
            fp += a * kk * cos(ph);
            fpp -= a * kk * kk * sin(ph);
        }
        float dist = abs(v - f) / sqrt(1.0 + fp * fp);
        float focus = 0.6 + 1.8 * smoothstep(0.5, 3.0, abs(fpp));    // the light gathers where the line bends
        float g = exp(-pow(dist / 0.0022, 2.0)) * focus + 0.2 * exp(-dist / 0.012);
        col += famLight(fh, h, 0.55 * exp(-pow(dist / 0.002, 2.0))) * g * bright * 0.7;
    }
    finish(famExpose(col, 4.95, 0.70, 0.03, fh));
}
