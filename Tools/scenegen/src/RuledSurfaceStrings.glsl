//@doc
 * @brief RULED SURFACE STRINGS: a lattice of ruled surfaces -- hyperboloids of one sheet and saddles -- drawn only by
 * their straight generating lines, taut strings of light; the eye glides through the woven string-work.  At a height
 * z the hyperboloid's strings of one family stand on a circle of radius sqrt(1 + z^2/c^2), turned by +atan(z/c), the
 * other family by -atan(z/c); the saddle z = xy/k carries the lines x = a, z = ay/k and y = b, z = bx/k.  One colour
 * family from the photo, the two families of a surface in neighbouring shades.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance       -> the strings turn round each surface and the saddles swivel (integrated); and the glide
 *   audioSwell         -> the strings' density: in between the strings further ones fade in
 *   audioSectionId/Age -> every new section turns the lattice to the other kind of surface, over six seconds
 *
 * Knobs: waistP (the hyperboloids' waist), stringP (the strings' base count), hueP.
//@params waistP stringP
//@audio audioSectionId audioSectionPrev audioSectionAge audioSwell
//@body
/**  The distance to one family of a hyperboloid's strings.
 *
 * @param q     The point (axis z, waist radius 1). (in)
 * @param c     The waist's steepness. (in)
 * @param n     The number of strings. (in)
 * @param sgn   The family: +1 or -1. (in)
 * @param turn  The strings' turn round the axis. (in)
 *
 * @return
 *   The distance (approximate, along the strings' slant).
 **/
float hypFamily(vec3 q, float c, float n, float sgn, float turn)
{
    float R = sqrt(1.0 + q.z * q.z / (c * c));
    float ph = atan(q.y, q.x) - sgn * atan(q.z / c) - turn;
    float k = floor(ph * n / 6.2831853 + 0.5);
    float dph = ph - k * 6.2831853 / n;
    float r = length(q.xy);
    return length(vec2(r - R, R * dph)) * c / sqrt(1.0 + c * c);
}

/**  The distance to the saddle's two families of lines over the square |x|, |y| < 1.2.
 *
 * @param q   The point. (in)
 * @param k   The saddle's flatness (z = xy/k). (in)
 * @param sp  The lines' spacing. (in)
 *
 * @return
 *   The distance.
 **/
float saddleLines(vec3 q, float k, float sp)
{
    float a = clamp(floor(q.x / sp + 0.5) * sp, -1.2, 1.2);
    float b = clamp(floor(q.y / sp + 0.5) * sp, -1.2, 1.2);
    float d1 = length(vec3(q.x - a, (q.z - a * q.y / k) / sqrt(1.0 + a * a / (k * k)), max(abs(q.y) - 1.2, 0.0)));
    float d2 = length(vec3(q.y - b, (q.z - b * q.x / k) / sqrt(1.0 + b * b / (k * k)), max(abs(q.x) - 1.2, 0.0)));
    return min(d1, d2);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    const float CELL = 4.2;
    float c = 0.7 + 0.6 * clamp(waistP, 0.0, 1.0);
    float n = floor(10.0 + 8.0 * clamp(stringP, 0.0, 1.0));
    float dense = clamp(audioSwell, 0.0, 1.0);
    float kind = mix(mod(max(audioSectionPrev, 0.0), 2.0), mod(max(audioSectionId, 0.0), 2.0),
                     smoothstep(0.0, 6.0, audioSectionAge));
    float turn = 0.25 * audioAdvance + 0.03 * sceneTime;
    float glide = 0.3 * sceneTime + 1.3 * audioAdvance;
    vec3 ro = vec3(0.35 * sin(0.04 * glide), 0.3 * cos(0.035 * glide), glide);
    vec3 rd = normalize(vec3(p, 1.1));
    rd.xz = rot2(0.3 * sin(0.022 * sceneTime)) * rd.xz;
    rd.yz = rot2(0.2 * sin(0.018 * sceneTime + 1.0)) * rd.yz;
    const mat3 SKEW = mat3(0.9287, 0.0000, -0.3709, 0.1778, 0.8776, 0.4452, 0.3255, -0.4794, 0.8150);
    vec3 rdL = SKEW * rd;
    vec3 col = vec3(0.0);
    float t = 0.05;
    for (int i = 0; i < 100; ++i) {
        vec3 x = SKEW * (ro + rd * t);
        vec3 cid = floor(x / CELL);
        vec3 q0 = x - (cid + 0.5) * CELL;
        float hc = fract(sin(dot(cid, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        vec3 q = q0;
        q.xz = rot2(6.2831853 * hc) * q.xz;
        q.yz = rot2(2.0 * hc) * q.yz;
        float tw = turn * (hc < 0.5 ? 1.0 : -1.0);
        vec3 qh = q / 0.75;
        float bound = max(abs(qh.z) - 1.6, 0.0) * 0.75;
        // the hyperboloid: two families, and between them a second set fading in with the swell
        float hA = min(hypFamily(qh, c, n, 1.0, tw), hypFamily(qh, c, n, -1.0, tw)) * 0.75;
        float hB = min(hypFamily(qh, c, n, 1.0, tw + 3.14159265 / n), hypFamily(qh, c, n, -1.0, tw + 3.14159265 / n)) * 0.75;
        hA = length(vec2(hA, bound));
        hB = length(vec2(hB, bound));
        // the saddle, swivelling about its axis
        vec3 qs = q;
        qs.xy = rot2(tw) * qs.xy;
        float sA = saddleLines(qs, 1.1, 2.4 / n * 2.0);
        float sB = saddleLines(qs + vec3(1.2 / n * 2.0, 1.2 / n * 2.0, 0.0), 1.1, 2.4 / n * 2.0);
        float w = 0.014;
        float gH = 1.0 / (1.0 + pow(max(hA - w, 0.0) * 40.0, 2.0)) + dense / (1.0 + pow(max(hB - w, 0.0) * 40.0, 2.0));
        float gS = 1.0 / (1.0 + pow(max(sA - w, 0.0) * 40.0, 2.0)) + dense / (1.0 + pow(max(sB - w, 0.0) * 40.0, 2.0));
        // the two kinds cross-fade in light (a blend of their distances would show neither)
        float g = mix(gH, gS, kind);
        float fade = exp(-0.08 * t) * smoothstep(0.05, 0.5, t);
        col += famLight(fh, 0.2 + 0.6 * hc, 0.15) * g * fade * 0.06;
        float d = min(min(hA, hB), min(sA, sB)) - w;
        vec3 wall = (0.5 * CELL - abs(q0)) / max(abs(rdL), 1e-3);
        t += clamp(0.55 * d, 0.015, max(min(wall.x, min(wall.y, wall.z)), 0.0) + 0.03);
        if (t > 32.0) break;
    }
    col += famCol(fh, 0.5) * 0.012;
    finish(famExpose(col, 1.10, 1.00, 0.00, fh));
}
