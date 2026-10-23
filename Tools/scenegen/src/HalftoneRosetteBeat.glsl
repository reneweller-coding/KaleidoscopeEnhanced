//@doc
 * @brief HALFTONE ROSETTE BEAT: a four-colour halftone (cyan, magenta, yellow and black at 15, 75, 0 and 45 degrees) whose angles glide with time: rosettes and moire form and form
 * again, the dots printed one over another on white paper in the photo's own colours.  The dot size follows the swell and the screens' angles turn with the music's phase.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the screens' angles glide (integrated)
 *   audioSwell      -> the dots' size
 *
 * Knobs: fineP (the screen's fineness), inkP (how heavy the ink lies), hueP.
//@params fineP inkP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = 0.04 * sceneTime + 0.3 * audioPhase;
    float N = 55.0 + 70.0 * clamp(fineP, 0.0, 1.0);
    vec3 c = imgLod(uv, 0.8);
    float k = 1.0 - max(c.r, max(c.g, c.b));
    vec3 cmy = (1.0 - c - k) / max(1.0 - k, 0.03);
    float amp = 0.7 + 0.5 * clamp(inkP, 0.0, 1.0) + 0.3 * clamp(audioSwell, 0.0, 1.0);
    vec4 ink = vec4(cmy, k) * amp;
    vec3 paper = vec3(0.97, 0.95, 0.9);
    vec3 col = paper;
    for (int i = 0; i < 4; ++i) {
        float base = i == 0 ? 0.2618 : (i == 1 ? 1.309 : (i == 2 ? 0.0 : 0.7854));
        float a = base + 0.5 * sin(0.7 * t + float(i));
        vec2 f = fract(rot2(a) * p * N) - 0.5;
        float cov = i == 0 ? ink.x : (i == 1 ? ink.y : (i == 2 ? ink.z : ink.w));
        float dt = smoothstep(0.08, -0.08, length(f) - 0.62 * sqrt(clamp(cov, 0.0, 1.0)));
        vec3 inkCol = i == 0 ? vec3(0.0, 0.62, 0.86) : (i == 1 ? vec3(0.9, 0.1, 0.5) : (i == 2 ? vec3(1.0, 0.9, 0.0) : vec3(0.08, 0.08, 0.1)));
        col *= mix(vec3(1.0), inkCol, dt * 0.92);
    }
    finish(col * 1.08);
}
