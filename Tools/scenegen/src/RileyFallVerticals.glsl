//@doc
 * @brief RILEY FALL VERTICALS: vertical lines in sine waves whose amplitude grows from the top of the picture to the bottom as in Bridget Riley's "Fall": at the top the lines stand almost straight and quiet, lower down they
 * swell into a swirl.  The lines carry the photo: its colour and its brightness give the colour and the thickness of every line, on a dark ground.  The place of the swell moves with the drive of the music and the wave's
 * frequency follows the spectral spread.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the swirl's place moves (integrated)
 *   audioSpread     -> the frequency of the wave
 *
 * Knobs: lineP (the number of lines), hueP.
//@params lineP
//@audio audioSpread
//@body
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float N = 40.0 + 60.0 * clamp(lineP, 0.0, 1.0);
    float yy = 0.5 - p.y + 0.12 * sin(0.04 * audioAdvance + 0.02 * sceneTime);
    float amp = 0.02 + 0.2 * pow(clamp(yy, 0.0, 1.5), 1.6);
    float fq = 5.0 + 6.0 * clamp(audioSpread, 0.0, 1.0);
    float x = p.x + amp * sin(fq * p.y + 0.5 * audioAdvance + 0.1 * sceneTime) * (0.5 + 0.5 * sin(2.0 * yy + 1.0));
    float xs = x * N;
    float f = abs(fract(xs) - 0.5);
    vec3 c = imgLod(vec2(x * 0.8 + 0.5, p.y * 0.8 + 0.5), 1.0);
    float th = 0.1 + 0.32 * luma(c);
    float line = smoothstep(th + 0.05, th - 0.05, f);
    finish(vec3(0.03) + c * 1.3 * line);
}
