//@doc
 * @brief AURORA RIBBON VOLUME: ribbons of light like the polar aurora, waving through an endless dark space in every
 * direction -- no sky, no ground -- curtain after curtain, each bright along its lower hem and fading upward in fine
 * rays.  Three families of curtains hang in three tilted directions, stacked without end; each curtain's hem waves.
 * One colour family from the photo, the hems paler than the veils above them.
 *
 * Audio Reactivity (structure, not only light):
 *   audioMelody[96] -> the hems' wave is the melody itself: the last eight seconds of the tune, smoothed, drawn along
 *                      the curtains (mirrored, so the curve has no seam), sliding on as the tune goes on
 *   audioSwell      -> the curtains' brightness
 *   audioAdvance    -> the drift and the rays' flicker running along the curtains (integrated)
 *
 * Knobs: waveP (how far the hems swing), rayP (how fine the rays), hueP.  Distinct from the aurora scenes with sky
 * and earth.
//@params waveP rayP
//@audio audioMelody[96] audioMelodyHead audioSwell
//@body
vec4 gMelA = vec4(0.5);    // the melody at ages 0..3, smoothed (set per pixel before the march)
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

/**  The melody curve at a place along the curtain: the eight ages joined smoothly, mirrored so it has no seam.
 *
 * @param u  The place (any value). (in)
 *
 * @return
 *   The pitch, 0..1 (0.5 when none sounds).
 **/
float melodyAt(float u)
{
    float a = abs(fract(u) * 2.0 - 1.0) * 7.0;
    float k = floor(a), f = smoothstep(0.0, 1.0, a - k);
    int i0 = int(k), i1 = min(i0 + 1, 7);
    return mix(melAge(i0), melAge(i1), f);
}

/**  One family of curtains: planes across n, stacked every 5 units, each hanging along v with its hem waving.
 *
 * @param x      The point. (in)
 * @param n      The curtains' normal. (in)
 * @param v      Their hanging direction. (in)
 * @param amp    How far the hems swing. (in)
 * @param rays   The rays' fineness. (in)
 * @param run    The rays' flicker phase. (in)
 * @param seed   The family's own offset. (in)
 * @param hem    Returns how close to the hem (1 at the hem). (out)
 *
 * @return
 *   The curtain's light at the point.
 **/
float curtains(vec3 x, vec3 n, vec3 v, float amp, float rays, float run, float seed, out float hem)
{
    vec3 u = cross(n, v);
    float pu = dot(x, u), pv = dot(x, v), pn = dot(x, n);
    float k = floor(pn / 5.0 + 0.5 + seed);
    float sheet = pn - (k - seed) * 5.0 + 0.6 * sin(0.21 * pu + 1.7 * k) + 0.3 * sin(0.47 * pu + k);
    // the hem: the melody's curve along the curtain, stacked every 7 units up the hanging direction
    float m = melodyAt(pu / 26.0 + 0.37 * k + seed);
    float edge = pv + amp * (m - 0.5) * 3.0 + 0.5 * sin(0.13 * pu + 2.3 * k);
    float e = edge - 7.0 * floor(edge / 7.0);                    // height above the hem, 0..7
    hem = exp(-e * 1.4);
    float veil = smoothstep(0.0, 0.2, e) * exp(-e * 0.35) * smoothstep(7.0, 6.0, e);
    float ray = 0.55 + 0.45 * sin(rays * pu + 3.0 * sin(0.3 * pu + run + k));
    return exp(-pow(sheet / 0.3, 2.0)) * veil * ray * (0.5 + 2.0 * hem);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    melodyControls();
    float amp = 0.5 + 0.7 * clamp(waveP, 0.0, 1.0);
    float rays = 3.0 + 4.0 * clamp(rayP, 0.0, 1.0);
    float bright = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float run = 0.5 * audioAdvance + 0.05 * sceneTime;
    float drift = 0.25 * sceneTime + 1.0 * audioAdvance;
    vec3 ro = vec3(0.7 * sin(0.03 * drift), 0.5 * cos(0.025 * drift), drift);
    vec3 rd = normalize(vec3(p, 1.0));
    rd.xz = rot2(0.5 * sin(0.017 * sceneTime)) * rd.xz;
    rd.yz = rot2(0.3 * sin(0.013 * sceneTime + 1.0)) * rd.yz;
    rd.xy = rot2(0.01 * sceneTime) * rd.xy;
    const vec3 N1 = vec3(0.8, 0.0, 0.6), V1 = vec3(0.0, 1.0, 0.0);
    const vec3 N2 = vec3(-0.36, 0.48, 0.8), V2 = vec3(0.8, 0.6, 0.0);
    const vec3 N3 = vec3(0.0, 0.8, -0.6), V3 = vec3(0.0, 0.6, 0.8);
    vec3 col = vec3(0.0);
    float t = 0.2;
    for (int i = 0; i < 64; ++i) {
        vec3 x = ro + rd * t;
        float h1, h2, h3;
        float c1 = curtains(x, N1, V1, amp, rays, run, 0.0, h1);
        float c2 = curtains(x, N2, V2, amp, rays, run, 0.33, h2);
        float c3 = curtains(x, N3, V3, amp, rays, run, 0.71, h3);
        float fade = exp(-0.11 * t);
        col += (famLight(fh, 0.2 + 0.3 * h1, 0.5 * h1) * c1 + famLight(fh, 0.45 + 0.3 * h2, 0.5 * h2) * c2
                + famLight(fh, 0.7 + 0.3 * h3, 0.5 * h3) * c3) * fade * 0.2;
        t += 0.25 + 0.012 * t;
    }
    col *= bright;
    col += famCol(fh, 0.5) * 0.012;
    finish(col);
}
