//@doc
 * @brief DINOFLAGELLATE WAKE FIELD: unseen swimmers cross dark water full of dinoflagellates, and every one leaves a
 * glowing wake -- a bright track along its path and the two arms of a Kelvin wedge opening behind it -- the wakes
 * crossing one another and fading as the water settles.  Each swimmer's path is the melody: the track behind it rises
 * and falls with the smoothed pitches of the last moments, so the newest notes are nearest the swimmer.  The wake's
 * arms open at the Kelvin angle (19.5 degrees) from the track and fade with the time since the swimmer passed.  The
 * glow is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioMelody[96] -> the swimmers' paths follow the melody (smoothed over eight ages)
 *   audioSwell      -> how many swimmers there are (they fade in and out one by one)
 *   audioAdvance    -> the swimmers swim (integrated)
 *
 * Knobs: wakeP (how long the wakes last), swimP (how far the melody sways the paths), hueP.
//@params wakeP swimP
//@audio audioMelody[96] audioMelodyHead audioSwell
//@body
vec4 gMelA = vec4(0.5);    // the melody at ages 0..3, smoothed
vec4 gMelB = vec4(0.5);    // the melody at ages 4..7

/**  The melody at eight ages: triangle-weighted means over the ring, the sounding samples only.
 **/
void melodyControls()
{
    int hi = int(audioMelodyHead * 96.0);
    float g[8];
    for (int k = 0; k < 8; ++k) {
        float s = 0.0, w = 0.0;
        for (int j = 0; j < 12; ++j) {
            int age = k * 12 + j;
            float m = audioMelody[(hi + 96 - age) % 96];
            float wj = (6.5 - abs(float(j) - 5.5)) * step(0.001, m);
            s += wj * m;
            w += wj;
        }
        g[k] = w > 0.0 ? s / w : 0.5;
    }
    gMelA = vec4(g[0], g[1], g[2], g[3]);
    gMelB = vec4(g[4], g[5], g[6], g[7]);
}

/**  The smoothed melody at one of the eight ages.
 *
 * @param i  The age's number, 0..7. (in)
 *
 * @return
 *   The pitch.
 **/
float melAge(int i)
{
    vec4 v = i < 4 ? gMelA : gMelB;
    int j = i < 4 ? i : i - 4;
    return j == 0 ? v.x : j == 1 ? v.y : j == 2 ? v.z : v.w;
}

/**  The melody along a track: the eight ages joined smoothly.
 *
 * @param u  The place along the track, 0 (now) .. 1 (the oldest age). (in)
 *
 * @return
 *   The pitch, 0..1.
 **/
float melodyAt(float u)
{
    float x = clamp(u, 0.0, 1.0) * 7.0;
    int i = int(min(floor(x), 6.0));
    return mix(melAge(i), melAge(i + 1), smoothstep(0.0, 1.0, x - float(i)));
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    melodyControls();
    float n = 4.0 + 4.0 * clamp(audioSwell, 0.0, 1.0);
    float L = 1.0 + 0.6 * clamp(wakeP, 0.0, 1.0);                   // how far behind the wake still glows
    float sway = 0.12 + 0.18 * clamp(swimP, 0.0, 1.0);
    float swim = 0.05 * sceneTime + 0.2 * audioAdvance;
    const float KT = 0.3541;                                         // tan of the Kelvin angle, 19.5 degrees
    vec3 col = famCol(fh, 0.45) * 0.02 * (0.6 + 0.8 * fbm(3.0 * p + 0.05 * swim));
    for (int i = 0; i < 8; ++i) {
        float fi = float(i);
        float wi = clamp(n - fi, 0.0, 1.0);
        if (wi <= 0.0) break;
        float hi = fract(sin(fi * 12.9898) * 43758.5453);
        float dirn = mod(fi, 2.0) < 0.5 ? 1.0 : -1.0;
        vec2 q = rot2(0.5 * (hi - 0.5)) * p;
        q.x *= dirn;
        // the swimmer crosses, far enough out on both sides that its whole wake has left the screen before it returns
        float span = 2.0 + 2.0 * L;
        float hx = -1.0 - L + mod(swim * (0.6 + 0.4 * hi) + span * hi, span);
        float back = hx - q.x;                                       // how far behind the swimmer
        if (back < 0.0 || back > L) continue;
        float u = back / L;
        float base = 0.6 * (hi - 0.5);
        float y = base + sway * (melodyAt(u) - 0.5) * 2.0;
        float d = q.y - y;
        float fade = exp(-1.6 * u) * smoothstep(0.0, 0.02, back);
        float track = exp(-pow(d / 0.004, 2.0)) + 0.3 * exp(-abs(d) / 0.02);
        float arm = exp(-pow((abs(d) - KT * back) / (0.006 + 0.02 * u), 2.0)) * smoothstep(0.0, 0.1, back);
        col += famLight(fh, 0.3 + 0.4 * hi, 0.5 * (1.0 - u)) * (1.3 * track + arm) * fade * wi;
    }
    finish(col);
}
