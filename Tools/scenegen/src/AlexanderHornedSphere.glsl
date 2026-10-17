//@doc
 * @brief ALEXANDER HORNED SPHERE: a tree of linked rings in the manner of Alexander's horned sphere -- every ring holds
 * two smaller rings hooked through its body, each of those holds two more, turned a quarter, and so on: the linking
 * that never comes undone and makes the space round the horned sphere so strange.  With every change of harmony a
 * new generation of rings grows from the tips, up to six; then they withdraw one by one.  The tree turns slowly;
 * the photo lies on the rings.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> each change of harmony grows (or withdraws) a generation, gliding
 *   audioPhase      -> the tree turns (integrated)
 *   audioKick       -> the newest rings flash (light)
 *
 * Knobs: shrinkP (how much smaller each generation), tubeP (the rings' thickness), photoP (photo share), hueP.
//@params shrinkP tubeP photoP
//@audio audioKick audioHarmAdvance
//@body
float gLvl = 0.0;          // the generation hit
vec3 gLoc = vec3(0.0);     // the hit in that ring's frame

/**  The tree's distance: a ring of radius 1 in the frame's xy-plane, its two children hooked through it at (+-1, 0, 0)
 * in the xz-plane, scaled by s and turned a quarter within their own plane.
 *
 * @param x       The point. (in)
 * @param levels  The generations grown (fractional: the newest grows in). (in)
 * @param s       The shrink per generation. (in)
 * @param tube    The rings' relative thickness. (in)
 *
 * @return
 *   The distance estimate (sets gLvl, gLoc).
 **/
float treeD(vec3 x, float levels, float s, float tube)
{
    vec3 q = x;
    float sc = 1.0, d = 1e9;
    for (int i = 0; i < 7; ++i) {
        float fi = float(i);
        float grow = clamp(levels - fi, 0.0, 1.0);
        if (grow <= 0.0) break;
        float dr = (length(vec2(length(q.xy) - 1.0, q.z)) - tube * grow) * sc;
        if (dr < d) { d = dr; gLvl = fi; gLoc = q; }
        q.x = abs(q.x);                                         // the two children, mirror images
        q -= vec3(1.0, 0.0, 0.0);
        q = vec3(-q.z, q.x, -q.y);                              // into the child's frame: its ring in our xz-plane,
                                                                // turned a quarter so its own children spread in z
        q /= s;
        sc *= s;
    }
    return d;
}

void main()
{
    vec2 p = screenP();
    float s = 0.4 + 0.1 * clamp(shrinkP, 0.0, 1.0);
    float tube = 0.07 + 0.06 * clamp(tubeP, 0.0, 1.0);
    // the generations: up by one per change of harmony to six, then down again (gliding)
    float h = max(audioHarmAdvance, 0.0);
    float hs = floor(h) + smoothstep(0.2, 0.8, fract(h));
    float levels = 2.0 + 4.0 - abs(mod(hs, 8.0) - 4.0);
    float spin = 0.04 * sceneTime + 0.01 * audioPhase;
    float ya = 0.035 * sceneTime, pa = 0.5 + 0.3 * sin(0.023 * sceneTime);
    vec3 ro = 3.0 * vec3(cos(pa) * sin(ya), sin(pa), cos(pa) * cos(ya));
    vec3 fw = normalize(-ro), rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw)), up = cross(fw, rt);
    vec3 rd = normalize(fw * 1.5 + rt * p.x + up * p.y);
    mat2 R = rot2(spin);
    float t = 0.0;
    bool hit = false;
    for (int i = 0; i < 110; ++i) {
        vec3 x = ro + rd * t;
        x.xz = R * x.xz;
        float d = treeD(x, levels, s, tube);
        if (d < 0.0005 * (1.0 + t)) { hit = true; break; }
        t += d * 0.8;
        if (t > 12.0) break;
    }
    vec3 tone = imgPalette(0.35 + 0.03 * audioPhase);
    vec3 bg = imgLod(p * 0.3 + 0.5, 3.5) * 0.15 + tone * 0.04;
    vec3 col = bg;
    if (hit) {
        vec3 x = ro + rd * t;
        x.xz = R * x.xz;
        float lv = gLvl;
        vec3 lq = gLoc;
        vec2 e = vec2(0.0012, 0.0);
        vec3 n = normalize(vec3(treeD(x + e.xyy, levels, s, tube) - treeD(x - e.xyy, levels, s, tube),
                                treeD(x + e.yxy, levels, s, tube) - treeD(x - e.yxy, levels, s, tube),
                                treeD(x + e.yyx, levels, s, tube) - treeD(x - e.yyx, levels, s, tube)));
        float ang = atan(lq.y, lq.x), tub = atan(lq.z, length(lq.xy) - 1.0);
        vec3 photo = imgLod(mirrorUV(vec2(ang, tub) / 3.14159265 + vec2(0.13 * lv, 0.0)), 0.5);
        vec3 tl = imgPalette(0.15 + 0.13 * lv + 0.03 * audioPhase);
        float head = abs(dot(n, rd));
        float diff = 0.3 + 0.7 * abs(dot(n, normalize(vec3(0.4, 0.8, 0.3))));
        vec3 c = mix(tl * 1.2, photo * 1.35, 0.45 + 0.45 * clamp(photoP, 0.0, 1.0)) * (0.5 * diff + 0.5 * head);
        float newest = 1.0 - smoothstep(0.0, 1.0, abs(levels - 1.0 - lv));
        c += mix(tl, vec3(1.0), 0.5) * newest * 0.4 * clamp(audioKick, 0.0, 1.0);
        col = mix(bg, c, exp(-0.06 * max(t - 3.0, 0.0)));
    }
    finish(col);
}
