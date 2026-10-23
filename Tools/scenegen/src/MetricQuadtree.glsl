//@doc
 * @brief METRIC QUADTREE: a division by the metre: the whole bar is cut into halves, the halves into beats, the beats into eighths and sixteenths, as a tree of rectangles, and the depth to which the picture is cut follows the
 * density of the onsets (smoothed in a small field of the scene's own): sparse music gives a few large cells, dense music a fine mosaic.  Every cell shows the photo a little displaced, so the cuts are visible, and the cells pulse
 * in the rhythm of their depth (once a bar for the biggest, up to eight times for the smaller); new cuts fade in, they never pop.
 *
 * Audio Reactivity (structure, not only light):
 *   audioOnset      -> the density of the onsets, smoothed (the depth of the division)
 *   audioBarPhase   -> the pulse of the cells by their depth
 *
 * Knobs: shiftP (how far the cells are displaced), hueP.
//@params shiftP
//@audio audioOnset
//@state 1 1 30 32
//@body
/**  The state pass: the onset density, smoothed over a couple of seconds.
 *
 * @return
 *   x the smoothed onset energy, 0, 0, 1.
 **/
vec4 stateStep()
{
    float old = stateFrame < 0.5 ? 0.0 : texelFetch(texState, ivec2(0, 0), 0).x;
    return vec4(old + (clamp(audioOnset, 0.0, 1.0) - old) * 0.02, 0.0, 0.0, 1.0);
}
void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float dens = clamp(texelFetch(texState, ivec2(0, 0), 0).x * 4.0, 0.0, 1.0);
    float n = 0.3 + 0.7 * dens + 0.15 * sin(0.05 * sceneTime);
    vec2 c01 = vec2(p.x / asp + 0.5, 0.5 - p.y);
    vec2 lo = vec2(0.0), hi = vec2(1.0);
    vec2 off = vec2(0.0);
    float line = 0.0, pulse = 1.0;
    float sh = 0.03 + 0.09 * clamp(shiftP, 0.0, 1.0);
    float bar = rhyBar();
    for (int d = 0; d < 5; ++d) {
        float fd = float(d);
        vec2 mid = 0.5 * (lo + hi);
        float h = hash21(lo * 7.0 + hi * 3.0 + fd);
        float a = smoothstep(0.0, 0.25, n * 1.2 + 0.3 - 0.18 * fd - 0.7 * h);
        bool ax = mod(fd, 2.0) < 0.5;
        float cc = ax ? c01.x : c01.y;
        float mm = ax ? mid.x : mid.y;
        float dm = abs(cc - mm) * (ax ? asp : 1.0);
        line = max(line, a * smoothstep(0.004, 0.0, dm));
        bool up = cc >= mm;
        if (ax) { if (up) lo.x = mm; else hi.x = mm; } else { if (up) lo.y = mm; else hi.y = mm; }
        vec2 hh = hash22(lo * 11.0 + hi * 5.0 + fd) - 0.5;
        off += a * hh * sh / (1.0 + 0.5 * fd);
        if (d < 4) pulse *= 1.0 + 0.1 * a * cos(6.2831853 * exp2(fd) * bar + 6.0 * h);
    }
    vec3 c = imgLod(p * 0.8 + 0.5 + off, 0.6);
    finish(c * pulse * (1.0 - 0.75 * line) * 1.1);
}
