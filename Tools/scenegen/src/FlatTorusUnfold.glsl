//@doc
 * @brief FLAT TORUS UNFOLD: the flat torus -- the Clifford torus in the three-sphere, a square with opposite sides glued
 * and not bent at all -- turning in four dimensions and seen by stereographic projection: a ring torus that swells,
 * turns itself inside out through its own hole, opens to infinity as it passes the projection's pole and closes
 * again from the other side.  The photo lies on it flat and undistorted in its own coordinates, with a square grid
 * that shows how it is glued.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos  -> one full turn in four dimensions each phrase (continuous)
 *   audioPhase      -> a second, slower turn (integrated)
 *   audioKick       -> the grid flashes (light)
 *
 * Knobs: gridP (grid lines per side), thickP (the sheet's thickness), photoP (photo share), hueP.
//@params gridP thickP photoP
//@audio audioKick audioPhrasePos
//@body
vec2 gTh = vec2(0.0);      // the torus' own angles at the hit

/**  The distance to the projected Clifford torus.
 *
 * @param x    The point in space. (in)
 * @param rot  The two turns in four dimensions. (in)
 * @param th   The sheet's angular half-thickness. (in)
 *
 * @return
 *   The distance estimate (sets gTh).
 **/
float torusD(vec3 x, vec2 rot, float th)
{
    float r2 = dot(x, x);
    vec4 q = vec4(2.0 * x, 1.0 - r2) / (1.0 + r2);
    q.xw = rot2(rot.x) * q.xw;
    q.yz = rot2(rot.y) * q.yz;
    float a = atan(length(q.zw), length(q.xy));                 // 0 on the circle z2 = 0, pi/2 on z1 = 0
    gTh = vec2(atan(q.y, q.x), atan(q.w, q.z));
    return (abs(a - 0.7853982) - th) * 0.5 * (1.0 + r2) * 0.8;
}

void main()
{
    vec2 p = screenP();
    float prog = audioPhrasePos > 0.001 ? audioPhrasePos : fract(sceneTime / 16.0);
    vec2 rot = vec2(6.2831853 * prog, 0.02 * audioPhase + 0.03 * sceneTime);
    float th = 0.01 + 0.015 * clamp(thickP, 0.0, 1.0);
    float ya = 0.03 * sceneTime, pa = 0.4 * sin(0.021 * sceneTime);
    vec3 ro = 5.2 * vec3(cos(pa) * sin(ya), sin(pa), cos(pa) * cos(ya));
    vec3 fw = normalize(-ro), rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw)), up = cross(fw, rt);
    vec3 rd = normalize(fw * 1.7 + rt * p.x + up * p.y);
    float side = torusD(ro, rot, th) < 0.0 ? -1.0 : 1.0;       // inside the sheet: march to its wall
    float t = 0.0;
    bool hit = false;
    for (int i = 0; i < 100; ++i) {
        float d = side * torusD(ro + rd * t, rot, th);
        if (d < 0.0008 * (1.0 + t)) { hit = true; break; }
        t += d;
        if (t > 30.0) break;
    }
    vec3 tone = imgPalette(0.4 + 0.03 * audioPhase);
    vec3 bg = imgLod(p * 0.3 + 0.5, 3.5) * 0.14 + tone * 0.04;
    vec3 col = bg;
    if (hit) {
        vec3 x = ro + rd * t;
        vec2 ang = gTh;
        vec2 e = vec2(0.002 * (1.0 + 0.3 * t), 0.0);
        vec3 n = normalize(vec3(torusD(x + e.xyy, rot, th) - torusD(x - e.xyy, rot, th),
                                torusD(x + e.yxy, rot, th) - torusD(x - e.yxy, rot, th),
                                torusD(x + e.yyx, rot, th) - torusD(x - e.yyx, rot, th)));
        vec3 photo = imgLod(mirrorUV(ang / 3.14159265), 0.4);
        float cells = floor(3.0 + 6.0 * clamp(gridP, 0.0, 1.0));
        vec2 gq = abs(fract(ang * cells / 6.2831853 + 0.5) - 0.5);
        float grid = 1.0 - smoothstep(0.0, 0.04, min(gq.x, gq.y));
        float diff = 0.3 + 0.7 * abs(dot(n, normalize(vec3(0.4, 0.8, 0.3))));
        float head = abs(dot(n, rd));
        vec3 c = mix(tone * 1.2, photo * 1.35, 0.45 + 0.45 * clamp(photoP, 0.0, 1.0)) * (0.5 * diff + 0.5 * head);
        c = mix(c, mix(tone, vec3(1.0), 0.5) * (0.4 + 0.8 * clamp(audioKick, 0.0, 1.0)), grid * 0.6);
        col = mix(bg, c, exp(-0.05 * max(t - 2.0, 0.0)));
    }
    finish(col);
}
