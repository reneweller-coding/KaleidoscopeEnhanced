//@doc
 * @brief SPHERE EVERSION LOOP: a field of spheres turning themselves inside out and back, in the manner of Thurston's
 * corrugations -- each sphere's radius shrinks through nothing while belts of waves running round it carry the
 * surface through itself, so that lobe by lobe the inside comes out; then the same way back.  The outside wears one
 * cut of the photo, the inside another, so the eversion shows as the two pictures trading places.  The spheres
 * stand in a grid seen from above, each a little out of step with its neighbours.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos  -> the eversion: out and back once a phrase (continuous)
 *   audioPhase      -> the belts' twist runs (integrated)
 *   audioKick       -> the surfaces' sheen flashes (light)
 *
 * Knobs: lobesP (the corrugations: 2 to 6 waves), stepP (how far neighbours are out of step), photoP (photo share),
 * hueP.
//@params lobesP stepP photoP
//@audio audioKick audioPhrasePos
//@body
float gBranch = 0.0;       // 1 on the sheet that lies outward along the view direction, -1 on the one through the centre
vec3 gU = vec3(0.0);       // the direction from the sphere's centre at the hit

/**  The corrugated radius of the everting sphere in one direction (it may be negative: the sheet has passed through
 * the centre).
 *
 * @param u   The unit direction. (in)
 * @param s   The eversion's progress, 0 (whole) .. 1 (inside out). (in)
 * @param k   The waves round the sphere. (in)
 * @param tw  The belts' twist. (in)
 *
 * @return
 *   The radius.
 **/
float evR(vec3 u, float s, float k, float tw)
{
    float az = atan(u.z, u.x), sn2 = 1.0 - u.y * u.y;
    return 0.75 * cos(3.14159265 * s) + 0.5 * sin(3.14159265 * s) * sn2 * cos(k * az + tw + 2.5 * u.y);
}

/**  The distance to the field of everting spheres.
 *
 * @param x    The point. (in)
 * @param k    The waves round each sphere. (in)
 * @param tw   The belts' twist. (in)
 * @param prog The phrase's progress. (in)
 * @param step How far neighbours are out of step. (in)
 *
 * @return
 *   The distance estimate (sets gBranch, gU).
 **/
float evMap(vec3 x, float k, float tw, float prog, float step)
{
    const float P = 2.6;
    vec2 cell = floor(x.xz / P + 0.5);
    vec3 q = x - vec3(cell.x * P, 0.0, cell.y * P);
    float s = 0.5 - 0.5 * cos(6.2831853 * (prog + step * hash21(cell)));
    float r = length(q);
    vec3 u = q / max(r, 1e-4);
    float r1 = evR(u, s, k, tw), r2 = evR(-u, s, k, tw);
    float d1 = abs(r - max(r1, 0.0)), d2 = abs(r - max(-r2, 0.0));   // the two sheets that can lie along u
    gBranch = d1 < d2 ? 1.0 : -1.0;
    gU = u;
    return min(d1, d2) * 0.45 - 0.012;
}

void main()
{
    vec2 p = screenP();
    float prog = audioPhrasePos > 0.001 ? audioPhrasePos : fract(sceneTime / 16.0);
    float k = floor(2.0 + 4.99 * clamp(lobesP, 0.0, 1.0));
    float tw = 0.02 * audioPhase + 0.3 * sceneTime;
    float step = 0.15 + 0.6 * clamp(stepP, 0.0, 1.0);
    // the eye above the field, drifting slowly over it
    vec3 ro = vec3(0.35 * sceneTime, 4.2, 0.13 * sceneTime);
    vec3 ta = ro + vec3(0.6, -3.4, 1.2);
    vec3 fw = normalize(ta - ro), rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw)), up = cross(fw, rt);
    vec3 rd = normalize(fw * 1.4 + rt * p.x + up * p.y);
    float t = 0.0;
    bool hit = false;
    for (int i = 0; i < 110; ++i) {
        float d = evMap(ro + rd * t, k, tw, prog, step);
        if (d < 0.0008 * (1.0 + t)) { hit = true; break; }
        t += max(d, 0.002);
        if (t > 14.0) break;
    }
    vec3 tone = imgPalette(0.3 + 0.03 * audioPhase);
    vec3 bg = imgLod(p * 0.3 + 0.5, 3.5) * 0.15 + tone * 0.04;
    vec3 col = bg;
    if (hit) {
        vec3 x = ro + rd * t;
        float br = gBranch;
        vec3 u = gU;
        vec2 e = vec2(0.002, 0.0);
        vec3 n = normalize(vec3(evMap(x + e.xyy, k, tw, prog, step) - evMap(x - e.xyy, k, tw, prog, step),
                                evMap(x + e.yxy, k, tw, prog, step) - evMap(x - e.yxy, k, tw, prog, step),
                                evMap(x + e.yyx, k, tw, prog, step) - evMap(x - e.yyx, k, tw, prog, step)));
        // which side faces the eye: the sheet's original outside points along u on the first sheet, against it on
        // the second (that sheet has passed through the centre)
        float outside = (br * dot(u, -rd)) > 0.0 ? 1.0 : 0.0;
        vec2 uvA = vec2(atan(u.z, u.x) / 6.2831853 + 0.5, u.y * 0.45 + 0.5);
        vec3 photoA = imgLod(mirrorUV(uvA * vec2(2.0, 1.0)), 0.4);
        vec3 photoB = imgLod(mirrorUV(uvA.yx * vec2(1.0, 2.0) + 0.37), 0.4);
        vec3 toneB = imgPalette(0.65 + 0.03 * audioPhase);
        vec3 c = outside > 0.5 ? mix(tone * 1.2, photoA * 1.3, 0.45 + 0.45 * clamp(photoP, 0.0, 1.0))
                               : mix(toneB * 1.2, photoB * 1.2, 0.35 + 0.45 * clamp(photoP, 0.0, 1.0)) * 0.8;
        vec3 l = normalize(vec3(0.3, 0.9, 0.4));
        float diff = 0.3 + 0.7 * abs(dot(n, l));
        float spec = pow(max(dot(reflect(rd, n), l), 0.0), 30.0) * (0.3 + 0.7 * clamp(audioKick, 0.0, 1.0));
        c = c * diff + spec * 0.5;
        col = mix(bg, c, exp(-0.06 * max(t - 3.0, 0.0)));
    }
    finish(col);
}
