//@doc
 * @brief CHOREOGRAPHY ORBIT TRAILS: a tiled space, each cell holding an n-body choreography -- five to twenty bodies
 * chasing each other along one shared path -- whose trails weave into a carpet of light.  The paths: the figure eight
 * (Chenciner-Montgomery, here as Gerono's lemniscate), a three-lobed rosette and a circle; the bodies sit at equal
 * spacing along the path and leave short glowing trails.  The bodies' colours are shades of one colour family from
 * the photo; the shared path glows faintly beneath.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSectionId/Age -> every new section changes the choreography (the paths' light cross-faded over six seconds)
 *   audioAdvance       -> the bodies run (integrated: the tempo of the music, the speed of the dance)
 *   audioSwell         -> the trails' length
 *
 * Knobs: bodyP (how many bodies), cellP (the cells' size), hueP.
//@params bodyP cellP
//@audio audioSectionId audioSectionPrev audioSectionAge audioSwell
//@body
/**  A point of a choreography's path.
 *
 * @param t     The path parameter (0..2 pi). (in)
 * @param kind  0 figure eight, 1 three-lobed rosette, 2 circle. (in)
 *
 * @return
 *   The point (cell units, about -0.4..0.4).
 **/
vec2 path(float t, float kind)
{
    if (kind < 0.5) return 0.4 * vec2(sin(t), sin(t) * cos(t));
    if (kind < 1.5) return 0.3 * vec2(cos(t) + 0.35 * cos(2.0 * t), sin(t) - 0.35 * sin(2.0 * t));
    return 0.33 * vec2(cos(t), sin(t));
}

/**  A choreography's light at a point of the cell.
 *
 * @param q      The point. (in)
 * @param kind   The path. (in)
 * @param n      The bodies. (in)
 * @param run    The run's phase. (in)
 * @param trail  The trails' length (radians). (in)
 * @param fh     The colour family. (in)
 *
 * @return
 *   The light.
 **/
vec3 dance(vec2 q, float kind, float n, float run, float trail, float fh)
{
    // the shared path, faintly
    float dp = 1e9;
    vec2 prev = path(0.0, kind);
    for (int i = 1; i <= 64; ++i) {
        vec2 cur = path(6.2831853 * float(i) / 64.0, kind);
        vec2 e = cur - prev;
        dp = min(dp, length(q - prev - e * clamp(dot(q - prev, e) / dot(e, e), 0.0, 1.0)));
        prev = cur;
    }
    vec3 col = famCol(fh, 0.4) * (exp(-pow(dp / 0.006, 2.0)) * 0.35 + exp(-dp / 0.03) * 0.08);
    // the bodies and their trails: where along its trail the point is nearest
    for (int b = 0; b < 20; ++b) {
        float fb = float(b);
        if (fb >= n) break;
        float t0 = run + 6.2831853 * fb / n;
        float best = 1e9, age = 0.0;
        vec2 pv = path(t0, kind);
        for (int k = 1; k <= 6; ++k) {
            float tk = t0 - trail * float(k) / 6.0;
            vec2 cur = path(tk, kind);
            vec2 e = cur - pv;
            float h = clamp(dot(q - pv, e) / max(dot(e, e), 1e-8), 0.0, 1.0);
            float d = length(q - pv - e * h);
            if (d < best) { best = d; age = (float(k) - 1.0 + h) / 6.0; }
            pv = cur;
        }
        float head = exp(-pow(length(q - path(t0, kind)) / 0.022, 2.0));
        col += famLight(fh, fb / n, 0.4) * (exp(-pow(best / 0.012, 2.0)) * (1.0 - age) * 1.1 + head * 1.4);
    }
    return col;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float n = floor(5.0 + 15.0 * clamp(bodyP, 0.0, 1.0));
    float S = 0.36 + 0.2 * clamp(cellP, 0.0, 1.0);
    float run = 0.3 * sceneTime + 1.2 * audioAdvance;
    float trail = 0.8 + 1.0 * clamp(audioSwell, 0.0, 1.0);
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    vec2 cid = floor(p / S + 0.5);
    vec2 q = (p - cid * S) / S;
    float hc = fract(sin(dot(cid, vec2(12.9898, 78.233))) * 43758.5453);
    q = rot2(6.2831853 * hc + 0.02 * sceneTime) * q;
    float r = run * (0.8 + 0.4 * hc);
    float kA = mod(max(audioSectionPrev, 0.0) + floor(hc * 3.0), 3.0), kB = mod(max(audioSectionId, 0.0) + floor(hc * 3.0), 3.0);
    vec3 col = dance(q, kB, n, r, trail, fh);
    if (m < 0.999 && kA != kB) col = mix(dance(q, kA, n, r, trail, fh), col, m);
    finish(col);
}
