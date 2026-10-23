//@doc
 * @brief RGB PARADE CASCADE: the RGB parade: three waveform monitors side by side, one for each colour channel of the photo -- red, green and blue curtains of light, the brightness of every column of the photo as a cloud of density --
 * and the three run into one another: as they move together the colours add and the photo's own white and grey emerge where the channels agree, as they part the curtains stand apart in their own colours.  The histograms
 * are counted in a small field of the scene's own, a few times a second.  The distance between the three follows the stereo width of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioStereo     -> the distance between the three curtains
 *   audioSwell      -> the density of the traces
 *
 * Knobs: glowP (how far the trace's glow reaches), hueP.
//@params glowP
//@audio audioStereo audioSwell
//@state 96 64 6 32
//@body
/**  The state pass: for every column of the photo and every brightness step the share of its pixels in that step, per colour channel (rgb) and in luma (a).
 *
 * @return
 *   The density, r g b a, smoothed against the last step.
 **/
vec4 stateStep()
{
    ivec2 c = stCell();
    float bin = float(c.y);
    vec4 sum = vec4(0.0);
    for (int i = 0; i < 4; ++i) {
        for (int j = 0; j < 40; ++j) {
            vec2 uv = vec2((float(c.x) + (float(i) + 0.5) / 4.0) / 96.0, (float(j) + 0.5) / 40.0);
            vec3 s = clamp(imgLod(uv, 2.0), 0.0, 0.999);
            vec3 b3 = floor(s * 64.0);
            sum.r += b3.r == bin ? 1.0 : 0.0;
            sum.g += b3.g == bin ? 1.0 : 0.0;
            sum.b += b3.b == bin ? 1.0 : 0.0;
            sum.a += floor(luma(s) * 64.0) == bin ? 1.0 : 0.0;
        }
    }
    vec4 now = sum / 160.0;
    vec4 old = stateFrame < 0.5 ? now : texelFetch(texState, c, 0);
    return mix(old, now, 0.35);
}
void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float Wp = asp * 0.42;
    float S = (0.04 + 0.6 * clamp(audioStereo, 0.0, 1.0)) * Wp * 1.6 + 0.05 * Wp * sin(0.02 * sceneTime);
    float g = 8.0 + 20.0 * clamp(audioSwell, 0.0, 1.0);
    float rd = 1.5 + 3.0 * clamp(glowP, 0.0, 1.0);
    vec3 col = imgLod(p * 0.8 + 0.5, 5.0) * 0.12;
    for (int i = 0; i < 3; ++i) {
        float fi = float(i);
        float ccx = (fi - 1.0) * S;
        float u = (p.x - ccx) / Wp * 0.5 + 0.5;
        float inside = smoothstep(0.0, 0.03, u) * smoothstep(1.0, 0.97, u);
        float by = (p.y + 0.5) * 64.0;
        float dd = 0.0;
        for (int k = -2; k <= 2; ++k) {
            float fk = float(k) * rd * 0.5;
            vec4 s = stLin(vec2(clamp(u, 0.0, 1.0) * 96.0, by + fk));
            float v = i == 0 ? s.r : (i == 1 ? s.g : s.b);
            dd += v * exp(-0.25 * fk * fk / (rd * rd));
        }
        float tr = pow(clamp(dd * 0.35 * g, 0.0, 6.0), 0.55) * inside;
        vec3 chan = i == 0 ? vec3(1.0, 0.15, 0.1) : (i == 1 ? vec3(0.1, 1.0, 0.2) : vec3(0.15, 0.3, 1.0));
        col += tr * mix(chan, vec3(1.0), 0.2) * 0.8;
    }
    finish(col);
}
