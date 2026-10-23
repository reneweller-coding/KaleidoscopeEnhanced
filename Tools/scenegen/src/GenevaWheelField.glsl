//@doc
 * @brief GENEVA WHEEL FIELD: a field of Maltese-cross drives that turn the photo on step by step, each with its own pause: a driver pin turns steadily and carries the cross on by a quarter turn (or a sixth) per revolution, the exact
 * kinematics of the Geneva drive, so that the cross rests and moves again in the soft rhythm of the mechanism (no jerk: the cross sets off and comes to rest with zero speed).  The photo lies on each wheel and steps with it.  The pins
 * make one turn a bar; each wheel's phase is its own.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBarPhase   -> the driver pins turn once a bar (continuous), each wheel with its own phase
 *   audioSwell      -> the light on the wheels
 *
 * Knobs: sizeP (the size of the wheels), hueP.
//@params sizeP
//@audio audioSwell
//@body
/**  The angle of a Geneva-driven wheel for a given angle of the driver (the exact drive).
 *
 * @param Phi  The driver's angle in turns, any value. (in)
 * @param n    The number of slots. (in)
 *
 * @return
 *   The wheel's angle in radians.
 **/
float genevaAngle(float Phi, float n)
{
    float lam = sin(3.1415927 / n);
    float phi0 = 1.5707963 - 3.1415927 / n;
    float u = Phi * 6.2831853 + 3.1415927;
    float wraps = floor(u / 6.2831853);
    float phi = u - wraps * 6.2831853 - 3.1415927;
    float pc = clamp(phi, -phi0, phi0);
    float th = atan(lam * sin(pc), 1.0 - lam * cos(pc));
    return wraps * 6.2831853 / n + th;
}
void main()
{
    vec2 p = screenP();
    float s = 0.4 - 0.15 * clamp(sizeP, 0.0, 1.0);
    vec2 cell = floor(p / s + 0.5);
    vec2 d = p - cell * s;
    float h = hash21(cell);
    float n = h < 0.5 ? 4.0 : 6.0;
    float Phi = rhyBar() + h * 3.0;
    float th = genevaAngle(Phi, n);
    float R = 0.46 * s;
    float r = length(d);
    vec2 dr = rot2(th) * d;
    float a = atan(dr.y, dr.x);
    float slotAng = abs(mod(a * n / 6.2831853 + 0.5, 1.0) - 0.5) * 6.2831853 / n;
    float lateral = sin(slotAng) * r;
    float slot = smoothstep(0.05 * s + 0.01, 0.05 * s - 0.01, lateral) * smoothstep(0.28 * R, 0.34 * R, r);
    float disc = smoothstep(R, R - 0.012, r);
    vec2 uv = rot2(-th) * d * 1.0 / s * 0.5 + 0.5 + 0.2 * vec2(sin(cell.x), cos(cell.y));
    vec3 c = imgLod(uv, 0.8);
    float body = disc * (1.0 - slot * 0.95);
    vec3 col = vec3(0.04) + c * (0.8 + 0.3 * clamp(audioSwell, 0.0, 1.0)) * body;
    finish(col * 1.15);
}
