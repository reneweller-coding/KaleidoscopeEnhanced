//@doc
 * @brief DUFFING BASIN PHOTO MAP: the Duffing model: a pendulum in a double-well potential with damping and driving; every point of the phase plane is assigned the well in which it ends, and the photo colours the basins, so a tangle of interlocked spiral arms arises.  Ninety-six steps of
 * the equation are run for every pixel, and the photo is read where the point lands (a different window for each well).
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the driving (the arms twist harder)
 *   audioRolloff -> the damping
 *   audioAdvance -> the phase of the driving runs on (integrated)
 *
 * Knobs: sizeP (the zoom into the phase plane), hueP.
//@params sizeP
//@audio audioSwell audioRolloff audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float zoom = 2.2 + 3.0 * (1.0 - clamp(sizeP, 0.0, 1.0));
    vec2 s = p * zoom * vec2(1.0, 1.0);
    float x = s.x;
    float v = s.y;
    float dmp = 0.14 + 0.2 * clamp(audioRolloff, 0.0, 1.0);
    float gam = 0.1 + 0.28 * clamp(audioSwell, 0.0, 1.0);
    float ph = 0.05 * audioAdvance + 0.03 * sceneTime;
    float dt = 0.1;
    float t = ph;
    float travel = 0.0;
    for (int i = 0; i < 96; ++i) {
        float a = x - x * x * x - dmp * v + gam * cos(1.1 * t);
        v += dt * a;
        x += dt * v;
        t += dt;
        travel += abs(v) * dt;
    }
    float side = x > 0.0 ? 1.0 : -1.0;
    vec2 uv = vec2(x * 0.5 * side * 0.0 + (x - side) * 0.7, v * 0.9) * 0.5 + 0.5 + vec2(0.18 * side, 0.0);
    vec3 c = imgLod(uv, 0.6);
    vec3 tint = side > 0.0 ? vec3(1.05, 0.95, 0.85) : vec3(0.85, 0.95, 1.08);
    float arms = 0.65 + 0.35 * cos(0.35 * travel + 2.0 * x);
    finish(c * tint * arms * 1.2);
}
