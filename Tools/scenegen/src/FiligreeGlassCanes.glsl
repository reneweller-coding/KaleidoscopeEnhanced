//@doc
 * @brief FILIGREE GLASS CANES: Venetian latticino canes laid side by side across the picture: in each clear glass rod
 * white threads wind in spirals, turning as the rod turns, neighbouring rods twisted the other way so their threads
 * cross like a net; the rods' clear edges catch the light.  A thread wound round the rod is a helix; seen from the side
 * it is a sine whose phase runs with the rod's turn, bright where it passes in front and faint where it runs behind.
 * The number of threads follows the harmony: they slide apart to make room as a new one fades in.  The threads are
 * white, touched by one colour family from the photo, the glass faintly tinted.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance     -> the rods turn (integrated)
 *   audioHarmAdvance -> how many threads wind in each rod (gliding: a new thread fades in, the others make room)
 *   audioSwell       -> the threads' glow
 *
 * Knobs: rodP (the rods' width), pitchP (how tightly the threads wind), hueP.
//@params rodP pitchP
//@audio audioHarmAdvance audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float W = 0.12 + 0.08 * clamp(rodP, 0.0, 1.0);
    float kx = 14.0 + 18.0 * clamp(pitchP, 0.0, 1.0);
    float h = max(audioHarmAdvance, 0.0);
    float n = 3.0 + 3.0 * (0.5 + 0.5 * sin(0.6 * h));
    float turn = 0.3 * sceneTime + 1.2 * audioAdvance;
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec2 q = rot2(0.35) * p;                                         // the rods run at a slant
    float ri = floor(q.y / W);
    float yl = (q.y - (ri + 0.5) * W) / (0.5 * W);                   // -1..1 across the rod
    float dirn = mod(ri, 2.0) < 0.5 ? 1.0 : -1.0;
    float hr = fract(sin(ri * 12.9898) * 43758.5453);
    // the clear rod: a faint body, darker at the grooves between the rods, its edges catching the light
    vec3 col = mix(vec3(1.0), famCol(fh, 0.5), 0.6) * 0.05 * (1.0 - yl * yl);
    col += famLight(fh, 0.5, 0.7) * exp(-pow((abs(yl) - 0.88) / 0.05, 2.0)) * 0.18;
    float rt = 0.75;
    for (int j = 0; j < 6; ++j) {
        float fj = float(j);
        float wj = clamp(n - fj, 0.0, 1.0);
        if (wj <= 0.0) break;
        float ph = kx * q.x * dirn + turn * (0.8 + 0.4 * hr) + 6.2831853 * fj / n + 6.2831853 * hr;
        float yt = rt * cos(ph), zt = sin(ph);
        float slope = rt * 0.5 * W * kx * sin(ph);                    // the thread's slope on screen
        float dd = abs(yl - yt) * 0.5 * W / sqrt(1.0 + slope * slope);
        float wline = 0.0025 + 0.0015 * (0.5 + 0.5 * zt);
        float front = 0.2 + 0.8 * smoothstep(-0.3, 0.6, zt);
        float g = (exp(-pow(dd / wline, 2.0)) + 0.15 * exp(-dd / (4.0 * wline))) * wj * front;
        col += famLight(fh, 0.4 + 0.2 * hr, 0.85) * g * glow;
    }
    finish(col);
}
