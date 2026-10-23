//@doc
 * @brief TRANSMISSION LINE STANDING WAVE: a line with a mismatch: waves running forth and back build standing waves with nodes and antinodes; the photo is warped in rows by the waveform, and the mismatch glides.  The picture shows the forward wave, the reflected wave and their sum as a
 * slow, standing-and-running bulging of the rows, strongest at the antinodes.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the waves run (integrated)
 *   audioSwell   -> the reflection (the standing-wave ratio)
 *
 * Knobs: sizeP (the wavelength), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float lam = 0.35 + 0.5 * clamp(sizeP, 0.0, 1.0);
    float beta = 6.2831853 / lam;
    float G = 0.3 + 0.65 * clamp(audioSwell, 0.0, 1.0);
    float t = 0.05 * audioAdvance + 0.06 * sceneTime;
    float fw = sin(beta * p.x - 6.2831853 * t);
    float bw = G * sin(beta * p.x + 6.2831853 * t * 1.0 + 1.0);
    float sw = fw + bw;
    float st = 2.0 * G * cos(beta * p.x + 0.5) * sin(6.2831853 * t);
    vec2 uv = p * 0.85 + 0.5;
    uv.y += 0.035 * sw * (0.6 + 0.4 * sin(2.0 * p.y + 3.0 * t));
    uv.x += 0.02 * st;
    vec3 c = imgLod(uv, 0.5);
    float amp = sqrt(1.0 + G * G + 2.0 * G * cos(2.0 * beta * p.x + 1.0));
    c *= 0.75 + 0.3 * amp / (1.0 + G);
    finish(c * 1.1);
}
