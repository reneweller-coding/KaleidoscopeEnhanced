//@doc
 * @brief FOUR BAR LINKAGE CARPET: a carpet of four-bar linkages whose coupler points trace curves: a crank, a coupler and a rocker on a frame, the crank turning once a bar and the coupler -- a plate that carries the photo -- led through
 * figures of eight and loops; the links are thin dark rods, the pin joints small bright dots, the plate shows the photo turned and carried with it.  Every unit has a crank phase of its own.  The crank follows the bar, the lengths of the
 * links the swell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBarPhase   -> the crank turns once a bar (continuous)
 *   audioSwell      -> the length of the crank
 *
 * Knobs: sizeP (the size of the units), hueP.
//@params sizeP
//@audio audioSwell
//@body
/**  The distance of a point to a segment.
 *
 * @param p  The point. (in)
 * @param a  One end. (in)
 * @param b  The other end. (in)
 *
 * @return
 *   The distance.
 **/
float segD(vec2 p, vec2 a, vec2 b)
{
    vec2 pa = p - a, ba = b - a;
    return length(pa - ba * clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0));
}
void main()
{
    vec2 p = screenP();
    float S = 0.75 - 0.3 * clamp(sizeP, 0.0, 1.0);
    vec2 cell = floor(p / S + 0.5);
    vec2 d = (p - cell * S) / S;
    float ph = 6.2831853 * (rhyBar() + hash21(cell));
    float a = 0.18 + 0.12 * clamp(audioSwell, 0.0, 1.0), b = 0.5, cc = 0.4, dd = 0.5;
    vec2 A = vec2(-0.25, -0.1), D = A + vec2(dd, 0.0);
    vec2 B = A + a * vec2(cos(ph), sin(ph));
    vec2 diff = D - B;
    float dist = length(diff);
    float x = (b * b - cc * cc + dist * dist) / (2.0 * dist);
    float h = sqrt(max(b * b - x * x, 0.0));
    vec2 ex = diff / dist, ey = vec2(-ex.y, ex.x);
    vec2 C = B + ex * x + ey * h;
    vec2 e1 = normalize(C - B), e2 = vec2(-e1.y, e1.x);
    vec2 q = vec2(dot(d - B, e1), dot(d - B, e2));
    float plate = smoothstep(0.01, 0.0, max(abs(q.x - 0.5 * b) - 0.5 * b * 1.0, abs(q.y - 0.1) - 0.2));
    vec3 c = imgLod(vec2(q.x / b, q.y / b) * 0.5 + 0.5 + 0.1 * vec2(sin(cell.x * 2.0), cos(cell.y * 2.0)) * 0.0 + vec2(0.0, 0.0), 0.9);
    c = imgLod(vec2(q.x / b * 0.5 + 0.35, q.y / b * 0.8 + 0.5) * 0.8 + 0.1 + 0.1 * vec2(hash21(cell), hash21(cell + 3.0)), 0.8);
    float rods = max(max(smoothstep(0.012, 0.004, segD(d, A, B)), smoothstep(0.012, 0.004, segD(d, D, C))), smoothstep(0.008, 0.002, segD(d, A, D)) * 0.6);
    float joints = 0.0;
    joints = max(joints, smoothstep(0.03, 0.01, length(d - A)));
    joints = max(joints, smoothstep(0.03, 0.01, length(d - B)));
    joints = max(joints, smoothstep(0.03, 0.01, length(d - C)));
    joints = max(joints, smoothstep(0.03, 0.01, length(d - D)));
    vec3 col = vec3(0.04) + 0.35 * imgLod(p * 0.8 + 0.5, 3.0);
    col = mix(col, c * 1.2, plate);
    col = mix(col, vec3(0.8, 0.8, 0.82), rods * 0.9);
    col = mix(col, vec3(1.0, 0.92, 0.7), joints);
    finish(col);
}
