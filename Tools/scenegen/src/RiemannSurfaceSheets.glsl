//@doc
 * @brief RIEMANN SURFACE SHEETS: the many-sheeted Riemann surfaces of the roots and the logarithm, built as spiral
 * ramps: going once round the axis climbs one sheet.  The n-th root has n sheets stacked in a drum, the logarithm a
 * ramp without end.  Every sheet shows the photo in its own branch's coordinates, so the picture runs on unbroken
 * from one sheet onto the next as it goes round, and the whole ramp screws slowly about its axis.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> each change of harmony changes the surface: square, cube, fourth and fifth root, logarithm
 *                       (crossfaded)
 *   audioPhase      -> the ramp screws (integrated)
 *   audioKick       -> the sheets' rims flash (light)
 *
 * Knobs: tiltP (how steeply the ramp is seen), gapP (the sheets' spacing), photoP (photo share), hueP.
//@params tiltP gapP photoP
//@audio audioKick audioHarmAdvance
//@body
float gSheet = 0.0;        // the sheet hit
float gPhi = 0.0;          // the branch's angle at the hit
float gR = 0.0;            // the radius at the hit

/**  The distance to one Riemann surface's ramp.
 *
 * @param x      The point (y up, the axis through the origin). (in)
 * @param kind   0..3: the square to fifth root, 4: the logarithm. (in)
 * @param screw  The screw angle. (in)
 * @param gap    The rise per turn. (in)
 *
 * @return
 *   The distance estimate (sets gSheet, gPhi, gR).
 **/
float rampD(vec3 x, int kind, float screw, float gap)
{
    bool isLog = kind == 4;
    float n = isLog ? 1.0 : float(kind + 2);
    float r = length(x.xz);
    float th = atan(x.z, x.x) - screw;
    th = mod(th + 3.14159265, 6.2831853) - 3.14159265;
    float c = gap / 6.2831853;                                  // the rise per radian
    float base = isLog ? 0.0 : -0.5 * gap * (n - 1.0);          // the roots' drum centred on y = 0
    float zz = x.y - base - c * th;
    float m = floor(zz / gap + 0.5);
    if (!isLog) m = clamp(m, 0.0, n - 1.0);
    float dz = zz - m * gap;
    float d = abs(dz) / sqrt(1.0 + c * c / max(r * r, 1e-4)) - 0.012;
    d = max(d, r - 1.0);                                        // the drum's wall
    d = min(d, r - 0.03);                                       // the axis
    gSheet = m;
    gPhi = (th + 6.2831853 * m) / n;
    gR = r;
    return d;
}

/**  Renders one surface.
 *
 * @param ro     The eye. (in)
 * @param rd     The view ray. (in)
 * @param kind   0..3: the square to fifth root, 4: the logarithm. (in)
 * @param screw  The screw angle. (in)
 * @param gap    The rise per turn. (in)
 *
 * @return
 *   The colour.
 **/
vec3 renderRamp(vec3 ro, vec3 rd, int kind, float screw, float gap)
{
    float n = kind == 4 ? 1.0 : float(kind + 2);
    float t = 0.0;
    bool hit = false;
    for (int i = 0; i < 80; ++i) {
        float d = rampD(ro + rd * t, kind, screw, gap);
        if (d < 0.0008 * (1.0 + t)) { hit = true; break; }
        t += d * 0.7;
        if (t > 9.0) break;
    }
    vec3 tone0 = imgPalette(0.35 + 0.03 * audioPhase);
    vec3 bg = imgLod(rd.xy * 0.3 + 0.5, 3.5) * 0.12 + tone0 * 0.03;
    if (!hit) return bg;
    vec3 x = ro + rd * t;
    float sh = gSheet, ph = gPhi, rr = gR;
    vec2 e = vec2(0.002, 0.0);
    vec3 nn = normalize(vec3(rampD(x + e.xyy, kind, screw, gap) - rampD(x - e.xyy, kind, screw, gap),
                             rampD(x + e.yxy, kind, screw, gap) - rampD(x - e.yxy, kind, screw, gap),
                             rampD(x + e.yyx, kind, screw, gap) - rampD(x - e.yyx, kind, screw, gap)));
    vec2 uv;
    if (kind == 4) uv = mirrorUV(vec2(log(max(rr, 1e-3)) * 0.4 + 0.9, ph / 6.2831853 * 0.5));
    else uv = 0.5 + 0.45 * pow(rr, 1.0 / n) * vec2(cos(ph), sin(ph));
    vec3 photo = imgLod(uv, 0.4);
    vec3 tone = imgPalette(0.2 + 0.13 * sh + 0.03 * audioPhase);
    vec3 l = normalize(vec3(0.4, 0.9, 0.2));
    float diff = 0.35 + 0.65 * abs(dot(nn, l));
    vec3 c = mix(tone * 1.2, photo * 1.3, 0.45 + 0.45 * clamp(photoP, 0.0, 1.0)) * diff;
    float rim = smoothstep(0.96, 0.995, rr);
    c += mix(tone, vec3(1.0), 0.5) * rim * 0.4 * (0.3 + clamp(audioKick, 0.0, 1.0));
    return mix(bg, c, exp(-0.08 * max(t - 2.0, 0.0)));
}

void main()
{
    vec2 p = screenP();
    float screw = 0.12 * sceneTime + 0.03 * audioPhase;
    float gap = 0.3 + 0.15 * clamp(gapP, 0.0, 1.0);
    // the eye circles the ramp slowly, looking down at it
    float ya = 0.03 * sceneTime, el = 0.35 + 0.45 * clamp(tiltP, 0.0, 1.0);
    vec3 ro = 2.1 * vec3(cos(el) * cos(ya), sin(el), cos(el) * sin(ya));
    vec3 fw = normalize(-ro), rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw)), up = cross(fw, rt);
    vec3 rd = normalize(fw * 1.25 + rt * p.x + up * p.y);
    float hA = max(audioHarmAdvance, 0.0);
    int kA = int(mod(floor(hA), 5.0)), kB = int(mod(floor(hA) + 1.0, 5.0));
    float g = smoothstep(0.2, 0.8, fract(hA));
    vec3 col = vec3(0.0);
    if (g < 0.999) col += (1.0 - g) * renderRamp(ro, rd, kA, screw, gap);
    if (g > 0.001) col += g * renderRamp(ro, rd, kB, screw, gap);
    finish(col);
}
