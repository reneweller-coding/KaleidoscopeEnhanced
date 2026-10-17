//@doc
 * @brief KEY SPIRAL ARRAY: Elaine Chew's spiral array, the geometry of tonality -- the pitches strung on an endless
 * helix by fifths, a quarter turn and a step up for each fifth, so that the notes of a major chord form a triangle and
 * neighbouring keys sit side by side.  A glowing centre of effect, the weighted mean of the notes being played,
 * wanders inside the helix as the harmony moves; the notes that sound light up.  The eye drifts along the helix.
 *
 * Audio Reactivity (structure, not only light):
 *   audioChroma     -> the notes light up, and their weighted mean is the centre of effect
 *   audioAdvance    -> the eye drifts along the helix (integrated)
 *   audioKick       -> the centre flashes (light)
 *
 * Knobs: pitchP (the helix's rise per fifth), beadP (the notes' size), photoP (photo share), hueP.
//@params pitchP beadP photoP
//@audio audioChroma[12] audioKick
//@body
float gK = 0.0;            // the note hit (its place on the line of fifths)

/**  A note's place on the spiral: the k-th fifth.
 *
 * @param k  The place on the line of fifths. (in)
 * @param h  The rise per fifth. (in)
 *
 * @return
 *   Its position.
 **/
vec3 spiralAt(float k, float h) { return vec3(sin(1.5707963 * k), cos(1.5707963 * k), k * h); }

/**  The distance to the spiral's notes and its thread.
 *
 * @param x   The point. (in)
 * @param h   The rise per fifth. (in)
 * @param rb  The notes' radius. (in)
 *
 * @return
 *   The distance (sets gK).
 **/
float spiralD(vec3 x, float h, float rb)
{
    float k0 = floor(x.z / h + 0.5);
    float best = 1e9;
    for (int i = -3; i <= 3; ++i) {
        float k = k0 + float(i);
        float d = length(x - spiralAt(k, h)) - rb;
        if (d < best) { best = d; gK = k; }
    }
    // the thread: the helix itself
    float th = atan(x.x, x.y);
    float kk = th / 1.5707963;
    float kn = kk + 4.0 * floor((x.z / h - kk) / 4.0 + 0.5);
    float dt = length(vec2(length(x.xy) - 1.0, x.z - kn * h)) - rb * 0.15;
    return min(best, dt);
}

void main()
{
    vec2 p = screenP();
    float h = 0.25 + 0.2 * clamp(pitchP, 0.0, 1.0);
    float rb = 0.12 + 0.08 * clamp(beadP, 0.0, 1.0);
    float zc = 0.3 * sceneTime + 1.0 * audioAdvance;
    // the centre of effect: the chroma-weighted mean of the twelve notes nearest the eye on the line of fifths
    float kc = floor(zc / h);
    vec3 ce = vec3(0.0);
    float wsum = 0.0;
    for (int i = -8; i <= 8; ++i) {
        float k = kc + float(i);
        int pc = int(mod(k * 7.0, 12.0));
        float win = smoothstep(7.0, 4.0, abs(k - zc / h));     // a soft window: no jump as the eye moves on
        float w = clamp(audioChroma[pc], 0.0, 1.0) * win;
        ce += w * spiralAt(k, h);
        wsum += w;
    }
    ce = wsum > 0.01 ? ce / wsum : vec3(0.0, 0.0, zc);
    vec3 ro = vec3(2.6 * sin(0.05 * sceneTime), 2.6 * cos(0.05 * sceneTime), zc - 2.2);
    vec3 ta = vec3(0.0, 0.0, zc + 0.6);
    vec3 fw = normalize(ta - ro), rt = normalize(cross(vec3(0.0, 0.0, 1.0), fw)), up = cross(fw, rt);
    vec3 rd = normalize(fw * 1.3 + rt * p.x + up * p.y);
    float t = 0.0;
    bool hit = false;
    float glow = 0.0;
    for (int i = 0; i < 90; ++i) {
        vec3 x = ro + rd * t;
        float d = spiralD(x, h, rb);
        float dc = length(x - ce) - 0.12;
        glow += 0.02 * exp(-dc * 6.0);
        if (dc < d) d = dc;
        if (d < 0.001 * (1.0 + t)) { hit = true; break; }
        t += d * 0.85;
        if (t > 14.0) break;
    }
    vec3 tone = imgPalette(0.4 + 0.03 * audioPhase);
    vec3 col = imgLod(p * 0.3 + 0.5, 5.0) * 0.12 + tone * 0.03;
    if (hit) {
        vec3 x = ro + rd * t;
        float k = gK;
        bool isCe = length(x - ce) < 0.125;
        vec2 e = vec2(0.002, 0.0);
        vec3 n = normalize(vec3(spiralD(x + e.xyy, h, rb) - spiralD(x - e.xyy, h, rb), spiralD(x + e.yxy, h, rb) - spiralD(x - e.yxy, h, rb),
                                spiralD(x + e.yyx, h, rb) - spiralD(x - e.yyx, h, rb)));
        if (isCe) n = normalize(x - ce);
        int pc = int(mod(k * 7.0, 12.0));
        float lit = isCe ? 1.5 : 0.35 + 1.0 * clamp(audioChroma[pc], 0.0, 1.0);
        vec3 tn = imgPalette(float(pc) / 12.0 + 0.03 * audioPhase);
        vec3 photo = imgLod(vec2(float(pc) / 12.0, 0.5) + n.xy * 0.2, 1.0);
        float diff = 0.35 + 0.65 * max(dot(n, -rd), 0.0);
        vec3 c = mix(tn * 1.3, photo * 1.5, 0.45 + 0.45 * clamp(photoP, 0.0, 1.0)) * diff * lit;
        if (isCe) c = mix(tone, vec3(1.0), 0.5) * (1.2 + 0.8 * clamp(audioKick, 0.0, 1.0));
        col = mix(col, c, exp(-0.08 * max(t - 2.0, 0.0)));
    }
    col += mix(tone, vec3(1.0), 0.4) * glow;
    finish(col);
}
