//@doc
 * @brief HENON ORBIT DUST: the Henon attractor -- x <- 1 - a x^2 + y, y <- b x -- magnified until its horseshoe
 * layers fill the frame, sheaf on sheaf of fine bands of dust, and the view swings in and out of the layering.  A
 * point lies near the attractor when it can be followed backward for long without running away (the inverse map
 * stretches every other point out), so the light is the number of backward steps it survives, a smooth count that
 * draws every layer at its own brightness.  One colour family from the photo, a shade per depth of the layering.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> a and b wander round the classic values with the chord changes: the layers fan and fold
 *   audioAdvance     -> the zoom's swing and the drift along the layers (integrated)
 *   audioSwell       -> the dust's glow widens
 *
 * Knobs: zoomP (how deep the zoom swings), dustP (how fine the dust), hueP.
//@params zoomP dustP
//@audio audioHarmAdvance audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float a = 1.4 + 0.04 * sin(0.7 * h) + 0.015 * sin(0.31 * h + 1.0);
    float b = 0.3 + 0.012 * cos(0.53 * h);
    float drift = 0.02 * sceneTime + 0.08 * audioAdvance;
    float swing = 0.5 - 0.5 * cos(0.6 * drift);
    float zoom = 2.2 * exp(-swing * (1.8 + 1.5 * clamp(zoomP, 0.0, 1.0)));
    // the view's centre slides along the attractor's main sheet (x ~ 0.6 .. 1.1)
    vec2 centre = mix(vec2(0.0, 0.0), vec2(0.63 + 0.2 * sin(0.37 * drift), 0.19 + 0.06 * sin(0.37 * drift)), swing);
    vec2 q = centre + rot2(-0.25) * vec2(p.x, p.y * 0.6) * zoom;
    float N = 14.0 + 10.0 * clamp(dustP, 0.0, 1.0);
    float n = 0.0;
    vec2 v = q;
    for (int i = 0; i < 24; ++i) {
        if (float(i) >= N) break;
        float x = v.y / b;
        float y = v.x - 1.0 + a * x * x;
        v = vec2(x, y);
        float r = dot(v, v);
        if (r > 25.0) {
            n += 1.0 - clamp(log(r / 25.0) / 6.0, 0.0, 1.0);
            break;
        }
        n += 1.0;
    }
    float s = n / N;
    // near the attractor a point survives a few more backward steps than its neighbours: that is the dust
    float g = smoothstep(1.2, 6.5 - 1.5 * clamp(audioSwell, 0.0, 1.0), n);
    vec3 col = famLight(fh, fract(0.6 * s + 0.1), 0.4 * g * g) * g * 1.1;
    col += famCol(fh, 0.5) * 0.012;
    finish(col);
}
