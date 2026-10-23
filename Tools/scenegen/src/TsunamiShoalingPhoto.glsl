//@doc
 * @brief TSUNAMI SHOALING PHOTO: a wave running toward a beach: as the water shallows the wave grows shorter and slower, higher and steeper; the photo piles up and overturns: the swell rises from the open water at the top of the
 * picture and breaks on the shore at its foot, the crests tipping forward (the photo folded over itself).  A train of long waves comes in, the height of the waves follows the swell of the music, and the sea draws back and returns with
 * the drive.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the height of the waves
 *   audioAdvance    -> the train runs in (integrated)
 *
 * Knobs: slopeP (how steep the beach is), hueP.
//@params slopeP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float tt = 0.4 * sceneTime + 0.3 * audioAdvance;
    float shore = -0.38;
    float d = max(p.y - shore, 0.0);
    float L = 0.7 + 0.8 * (1.0 - clamp(slopeP, 0.0, 1.0));
    float depth = clamp(d / L, 0.02, 1.0);
    float th = 9.0 * (sqrt(L) - sqrt(max(d, 0.0) * 0.0 + L)) + 0.0;
    float th2 = 7.0 * (2.0 * sqrt(d + 0.02) / sqrt(0.5 * L));
    float ph = th2 + tt * 1.4;
    float amp = (0.025 + 0.06 * clamp(audioSwell, 0.0, 1.0)) * pow(depth, -0.25);
    float env = 0.6 + 0.4 * sin(0.7 * ph * 0.25 + 1.0);
    float steep = smoothstep(1.0, 0.1, depth);
    float dy = amp * env * (sin(ph) + 0.35 * steep * sin(2.0 * ph + 1.0));
    float dx = amp * env * steep * 3.2 * cos(ph) * 0.3;
    vec3 c = imgLod((p + vec2(dx, dy)) * 0.8 + 0.5, 0.7);
    float foam = smoothstep(0.35, 0.0, depth) * smoothstep(0.2, 1.0, sin(ph) * env) * 0.5;
    finish(c * (0.85 + 0.25 * cos(ph) * env * steep) + foam * vec3(1.0, 1.0, 0.95));
}
