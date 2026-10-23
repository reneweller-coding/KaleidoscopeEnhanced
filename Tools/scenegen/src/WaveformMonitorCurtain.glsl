//@doc
 * @brief WAVEFORM MONITOR CURTAIN: the waveform monitor of video engineering, made into a surface of light: for every column of the photo it shows how often each brightness occurs, red, green and blue overlaid, so the photo
 * builds curtains of light that rise and fall in different jags for every photo -- a flat sky is a thin bright line, a busy place a cloud.  The histogram of the columns is counted in a small field of the scene's own (a few times a
 * second, gliding when the photo changes); the density of the trace follows the swell of the music, the scale drifts slowly.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the density (the brightness) of the trace
 *   audioAdvance    -> the scale drifts slowly up and down (integrated)
 *
 * Knobs: glowP (how far the trace's glow reaches), hueP.
//@params glowP
//@audio audioSwell
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
    float cx = (p.x / asp + 0.5) * 96.0;
    float by = (p.y + 0.5) * 64.0 + 4.0 * sin(0.02 * audioAdvance + 0.01 * sceneTime);
    float g = 8.0 + 20.0 * clamp(audioSwell, 0.0, 1.0);
    float rd = 1.5 + 3.0 * clamp(glowP, 0.0, 1.0);
    vec3 d = vec3(0.0);
    for (int k = -2; k <= 2; ++k) {
        float fk = float(k) * rd * 0.5;
        vec4 s = stLin(vec2(cx, by + fk));
        d += s.rgb * exp(-0.25 * fk * fk / (rd * rd));
    }
    d *= 0.35;
    vec3 trace = pow(clamp(d * g, 0.0, 6.0), vec3(0.55));
    vec3 bg = imgLod(p * 0.8 + 0.5, 5.0) * 0.14;
    float grat = 0.05 * smoothstep(0.004, 0.0, abs(fract((p.y + 0.5) * 4.0 + 0.5) - 0.5) * 0.25);
    finish(bg + trace * 0.95 + grat);
}
