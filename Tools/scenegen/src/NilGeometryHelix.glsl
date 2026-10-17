//@doc
 * @brief NIL GEOMETRY HELIX: inside a Nil manifold -- the Heisenberg group's lattice, where stepping once along x shears
 * every height by the y you stand at -- seen by light that runs along Nil's geodesics, which are helices: every ray
 * curls round the vertical as it climbs or falls.  The lattice's bars and balls twist into screw-shaped corridors,
 * the floors tilt as you look across them, and straight ahead the view coils like a spiral stair.  The photo
 * colours the lattice.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the eye glides and turns (integrated)
 *   audioSwell      -> the balls swell a little
 *   audioKick       -> the bars' sheen flashes (light)
 *
 * Knobs: curlP (how strongly the light curls), barP (the bars' thickness), photoP (photo share), hueP.
//@params curlP barP photoP
//@audio audioSwell audioKick
//@body
float gMat = 0.0;          // 0 the bars, 1 the balls

/**  The Nil lattice's contents, folded into the unit cell by the Heisenberg group's left action: (x, y, z) ~
 * (x + 1, y, z + y) ~ (x, y + 1, z) ~ (x, y, z + 1).
 *
 * @param x   The point. (in)
 * @param rb  The bars' radius. (in)
 * @param rs  The balls' radius. (in)
 *
 * @return
 *   The distance (sets gMat).
 **/
float nilD(vec3 x, float rb, float rs)
{
    float n = floor(x.x);
    x.x -= n;
    x.z -= n * x.y;                                             // the shear: one step along x lifts by y
    x.y = fract(x.y);
    x.z = fract(x.z);
    vec3 e = min(x, 1.0 - x);
    float barX = length(e.yz);                                  // along x on the cell's y and z faces
    float barZ = length(e.xy);                                  // upright on the x and y faces (unsheared lines)
    float barY = length(vec2(x.x - 0.5, e.z));                  // along y through the middle (clear of the x faces)
    float bars = min(min(barX, barZ), barY) - rb;
    float ball = length(x - 0.5) - rs;
    gMat = ball < bars ? 1.0 : 0.0;
    return min(bars, ball);
}

void main()
{
    vec2 p = screenP();
    float kap = 0.4 + 0.8 * clamp(curlP, 0.0, 1.0);
    float rb = 0.03 + 0.03 * clamp(barP, 0.0, 1.0);
    float rs = (0.13 + 0.05 * clamp(audioSwell, 0.0, 1.0));
    float s = 0.12 * sceneTime + 0.02 * audioPhase;
    vec3 ro = vec3(0.5 + 0.3 * sin(0.7 * s), 0.5 + s * 0.8, 0.5 + s * 0.35);   // x-steps shear: keep x near the origin
    float ya = 1.5707963 + 0.6 * sin(0.21 * s) + 0.3 * sin(0.03 * sceneTime), pa = 0.25 * sin(0.05 * sceneTime);
    vec3 fw = normalize(vec3(cos(pa) * cos(ya), cos(pa) * sin(ya), sin(pa)));
    vec3 rt = normalize(cross(vec3(0.0, 0.0, 1.0), fw)), up = cross(fw, rt);
    vec3 rd = normalize(fw * 1.2 + rt * p.x + up * p.y);
    vec3 x = ro;
    float t = 0.0;
    bool hit = false;
    float side = nilD(ro, rb, rs) < 0.0 ? -1.0 : 1.0;          // inside a bar or a ball: march to its inner wall
    for (int i = 0; i < 150; ++i) {
        float d = side * nilD(x, rb, rs);
        if (d < 0.0006 * (1.0 + t)) { hit = true; break; }
        float h = clamp(d * 0.8, 0.004, 0.12);
        x += rd * h;
        t += h;
        rd.xy = rot2(kap * rd.z * h) * rd.xy;                   // the geodesic curls about the vertical
        if (t > 9.0) break;
    }
    vec3 tone = imgPalette(0.35 + 0.03 * audioPhase);
    vec3 fog = imgLod(p * 0.3 + 0.5, 4.0) * 0.2 + tone * 0.05;
    vec3 col = fog;
    if (hit) {
        float mat = gMat;
        vec2 e = vec2(0.0015, 0.0);
        vec3 n = normalize(vec3(nilD(x + e.xyy, rb, rs) - nilD(x - e.xyy, rb, rs), nilD(x + e.yxy, rb, rs) - nilD(x - e.yxy, rb, rs),
                                nilD(x + e.yyx, rb, rs) - nilD(x - e.yyx, rb, rs)));
        vec3 photo = imgLod(mirrorUV(vec2(x.x * 0.17 + x.z * 0.06, x.y * 0.17 - x.z * 0.08)), 0.5);
        vec3 tm = imgPalette(0.2 + 0.35 * mat + 0.03 * audioPhase);
        float head = max(-side * dot(n, rd), 0.0);
        float spec = pow(head, 24.0) * (0.2 + 0.7 * clamp(audioKick, 0.0, 1.0));
        vec3 c = mix(tm * 1.2, photo * 1.35, 0.45 + 0.45 * clamp(photoP, 0.0, 1.0)) * (0.3 + 0.7 * head) + spec * 0.4;
        col = mix(fog, c, exp(-0.22 * t));
    }
    finish(col);
}
