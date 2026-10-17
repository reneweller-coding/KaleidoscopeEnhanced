//@doc
 * @brief ANTOINE NECKLACE ZOOM: Antoine's necklace, zoomed into without end -- a ring of linked tori, flat and upright
 * by turns; inside each link a smaller ring of links, inside each of those a smaller one, down to a dust of points
 * that is nowhere connected and yet cannot be pulled out of space.  The view sinks steadily toward one point of the
 * dust: the links it passes into fade away around it while the chain inside grows to take their place, so the zoom
 * never stops and never jumps.  The photo lies on the links.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the zoom (integrated: the music's drive)
 *   audioSwell      -> the links thicken a little
 *   audioKick       -> the links' sheen flashes (light)
 *
 * Knobs: linksP (links per ring: 12 to 20), tubeP (the links' thickness), photoP (photo share), hueP.
//@params linksP tubeP photoP
//@audio audioSwell audioKick
//@body
float gLv = 0.0;           // the level hit
vec3 gLq = vec3(0.0);      // the hit in its link's frame

/**  The torus of a link in its own frame: core circle of radius 1 in the xy-plane.
 *
 * @param q    The point in the link's frame. (in)
 * @param r    The tube's radius. (in)
 *
 * @return
 *   The distance.
 **/
float linkT(vec3 q, float r) { return length(vec2(length(q.xy) - 1.0, q.z)) - r; }

/**  Antoine's necklace from level lv0 down: fold into the nearest link of the ring, draw it (and its two neighbours),
 * descend into it.
 *
 * @param x     The point in the frame of level lv0. (in)
 * @param lv0   The first level (negative: rings round the view). (in)
 * @param N     Links per ring. (in)
 * @param a     A link's size relative to its ring. (in)
 * @param f     The zoom's progress within a level. (in)
 * @param tube  The links' relative thickness. (in)
 *
 * @return
 *   The distance estimate (sets gLv, gLq).
 **/
float necklaceD(vec3 x, float lv0, float N, float a, float f, float tube)
{
    vec3 q = x;
    float sc = 1.0, d = 1e9;
    float sec = 6.2831853 / N;
    for (int i = 0; i < 8; ++i) {
        float lv = lv0 + float(i);
        float w = smoothstep(-1.0, 0.0, lv - f);                // links fade as the view passes into them
        float k = floor(atan(q.y, q.x) / sec + 0.5);
        for (int j = -1; j <= 1; ++j) {
            float kk = k + float(j);
            vec3 r = q;
            r.xy = rot2(-kk * sec) * r.xy;
            r -= vec3(1.0, 0.0, 0.0);
            if (mod(kk, 2.0) > 0.5) r = vec3(r.z, r.y, -r.x);   // the odd links stand upright
            float dl = (linkT(r / a, tube * w) * a - 0.002 * (1.0 - w)) * sc;
            if (w > 0.01 && dl < d) { d = dl; gLv = lv; gLq = r / a; }
        }
        // into the nearest link: its chain lies on its core circle
        q.xy = rot2(-k * sec) * q.xy;
        q -= vec3(1.0, 0.0, 0.0);
        if (mod(k, 2.0) > 0.5) q = vec3(q.z, q.y, -q.x);
        q /= a;
        sc *= a;
    }
    return d;
}

void main()
{
    vec2 p = screenP();
    float N = 2.0 * floor(6.0 + 4.0 * clamp(linksP, 0.0, 1.0)); // even, so the links alternate round the ring
    float a = 1.15 * 3.14159265 / N;                            // a link's size: neighbours hook through each other
    float tube = (0.13 + 0.07 * clamp(tubeP, 0.0, 1.0)) * (0.9 + 0.2 * clamp(audioSwell, 0.0, 1.0));
    float z = 0.055 * sceneTime + 0.15 * audioAdvance;
    float f = fract(z);
    // the zoom: toward the fixed point of "into link 0", q* = (1 / (1 - a), 0, 0); the eye shrinks by a per level
    vec3 qs = vec3(1.0 / (1.0 - a), 0.0, 0.0);
    float zs = pow(a, f);
    vec3 off = vec3(0.25, -0.35, 0.6);
    vec3 ro = qs + zs * off;
    vec3 fw = normalize(-off + vec3(-0.6, 0.25, 0.0));
    vec3 rt = normalize(cross(vec3(0.0, 0.0, 1.0), fw)), up = cross(fw, rt);
    vec3 rd = normalize(fw * 1.3 + rt * p.x + up * p.y);
    float t = 0.0;
    bool hit = false;
    for (int i = 0; i < 120; ++i) {
        vec3 x = ro + rd * t;
        // two levels up: the ring round the ring round the view
        vec3 x2 = vec3(1.0, 0.0, 0.0) + a * (vec3(1.0, 0.0, 0.0) + a * x);
        float d = necklaceD(x2, -2.0, N, a, f, tube) / (a * a);
        if (d < 0.0006 * zs * (1.0 + t / zs)) { hit = true; break; }
        t += d * 0.7;
        if (t > 8.0 * zs) break;
    }
    vec3 tone = imgPalette(0.4 + 0.03 * audioPhase);
    vec3 bg = imgLod(p * 0.3 + 0.5, 3.5) * 0.14 + tone * 0.04;
    vec3 col = bg;
    if (hit) {
        float lv = gLv;
        vec3 lq = gLq;
        float ang = atan(lq.y, lq.x), tub = atan(lq.z, length(lq.xy) - 1.0);
        vec3 photo = imgLod(mirrorUV(vec2(ang, tub) / 3.14159265), 0.5);
        vec3 tl = imgPalette(0.2 + 0.25 * mod(lv, 2.0) + 0.03 * audioPhase);
        float shade = 0.45 + 0.55 * (0.5 + 0.5 * sin(tub));
        vec3 c = mix(tl * 1.2, photo * 1.35, 0.45 + 0.45 * clamp(photoP, 0.0, 1.0)) * shade;
        c += pow(max(sin(tub + 0.6), 0.0), 16.0) * (0.2 + 0.6 * clamp(audioKick, 0.0, 1.0)) * 0.6;
        col = mix(bg, c, exp(-0.4 * t / zs));
    }
    finish(col);
}
