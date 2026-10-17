//@doc
 * @brief DOUBLE PENDULUM FLIP FRACTAL: every pixel is a double pendulum released from its own pair of angles; its
 * colour is how long it takes until one arm first swings over the top.  Calm regions that never flip, and between
 * them a fractal tangle of boundaries where a hair's difference decides.  The initial velocities drift, so the
 * whole tangle writhes; each flip time reads its own cut of the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the energy: the starting velocities (the fractal swells and folds)
 *   audioRoughness  -> the damping (rough music: fewer flips, smoother fields)
 *   audioAdvance    -> the window drifts across the angle plane (integrated)
 *   audioKick       -> the boundaries flash (light)
 *
 * Knobs: zoomP (how much of the angle plane), stepsP (how long the pendulums swing), photoP (photo share), hueP.
//@params zoomP stepsP photoP
//@audio audioSwell audioKick audioRoughness
//@body
/**  The double pendulum's angular accelerations (equal masses and arms, g = 9.81).
 *
 * @param th  The two angles. (in)
 * @param w   The two angular velocities. (in)
 *
 * @return
 *   The two angular accelerations.
 **/
vec2 accel(vec2 th, vec2 w)
{
    float d = th.x - th.y, sd = sin(d), cd = cos(d);
    float den = 3.0 - cos(2.0 * d);
    float g = 9.81;
    float a1 = (-3.0 * g * sin(th.x) - g * sin(th.x - 2.0 * th.y) - 2.0 * sd * (w.y * w.y + w.x * w.x * cd)) / den;
    float a2 = 2.0 * sd * (2.0 * w.x * w.x + 2.0 * g * cos(th.x) + w.y * w.y * cd) / den;
    return vec2(a1, a2);
}

void main()
{
    vec2 p = screenP();
    // the whole square of starting angles
    float zoom = 0.75 + 0.5 * clamp(zoomP, 0.0, 1.0);
    vec2 drift = 0.3 * vec2(sin(0.013 * sceneTime + 0.002 * audioAdvance), cos(0.011 * sceneTime));
    vec2 th = p / vec2(0.8888889, 0.5) * 3.14159265 * zoom + drift;   // the square stretched over the frame
    float e = 0.3 + 1.6 * clamp(audioSwell, 0.0, 1.0);
    vec2 w = e * vec2(sin(0.05 * sceneTime), cos(0.04 * sceneTime));
    float damp = 0.02 + 0.25 * clamp(audioRoughness, 0.0, 1.0);
    int n = 150 + int(100.0 * clamp(stepsP, 0.0, 1.0));
    float dt = 0.06, T = -1.0;
    // semi-implicit Euler: cheap and stable enough for the flip time
    for (int i = 0; i < 250; ++i) {
        if (i >= n) break;
        w += dt * accel(th, w) - dt * damp * w;
        th += dt * w;
        if (abs(th.x) > 3.14159265 || abs(th.y) > 3.14159265) { T = float(i) / float(n); break; }
    }
    vec3 col;
    if (T < 0.0) {
        // never flipped: coloured by where the arms ended up (their own chaos, softer)
        vec2 fa = vec2(sin(th.x), sin(th.y));
        vec3 rest = imgLod(p * 0.6 + 0.5 + 0.25 * fa, 0.8);
        vec3 tn = imgPalette(0.5 + 0.25 * fa.x + 0.25 * fa.y + 0.03 * audioPhase);
        tn /= max(max(tn.r, tn.g), max(tn.b, 0.05));
        col = mix(rest, tn * 0.7, 0.3) * (0.45 + 0.55 * (0.5 + 0.5 * fa.y));
    } else {
        float k = sqrt(T);
        vec2 uv = p * 0.6 + 0.5 + vec2(0.37, 0.53) * floor(k * 6.0) + 0.1 * vec2(cos(k * 9.0), sin(k * 9.0));
        vec3 photo = imgLod(uv, 0.6);
        vec3 tone = imgPalette(k + 0.03 * audioPhase);
        col = mix(tone * (1.2 - 0.6 * k), photo, 0.3 + 0.6 * clamp(photoP, 0.0, 1.0)) * (1.3 - 0.8 * k);
    }
    // the boundaries: where the flip time changes fastest
    float gx = abs(dFdx(T)) + abs(dFdy(T));
    col += imgPalette(0.6 + 0.03 * audioPhase) * smoothstep(0.05, 0.3, gx) * 0.3 * (0.5 + clamp(audioKick, 0.0, 1.0));
    finish(col);
}
