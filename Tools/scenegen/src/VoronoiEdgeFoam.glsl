//@doc
 * @brief VORONOI EDGE FOAM: the edges of a three-dimensional Voronoi foam glow -- the lines where three cells meet
 * -- and the seeds wander, so the foam rebuilds itself without rest while the eye drifts through it.  Near an edge
 * the three nearest seeds are almost equally far, so the gap between the first and the third distance measures the
 * way to it.  One colour family from the photo; each cell's edges take a shade from the photo at the cell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the seeds wander (integrated): the foam re-forms, edges slide, cells swallow each other; and
 *                   the drift
 *   audioSpread  -> a broad spectrum lights the membranes between the edges too
 *   audioSwell   -> the edges' glow widens
 *
 * Knobs: cellP (the cells' size), wanderP (how far the seeds roam), hueP.
//@params cellP wanderP
//@audio audioSpread audioSwell
//@body
/**  A hash of a lattice cell (no trigonometry).
 *
 * @param p  The cell. (in)
 *
 * @return
 *   Three values in 0..1.
 **/
vec3 cellHash(vec3 p)
{
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.xxy + p.yxx) * p.zyx);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float S = 1.6 + 0.9 * clamp(cellP, 0.0, 1.0);
    float roam = 0.18 + 0.17 * clamp(wanderP, 0.0, 1.0);
    float wph = 0.6 * audioAdvance + 0.03 * sceneTime;
    float memb = 0.15 + 0.85 * clamp(audioSpread, 0.0, 1.0);
    float width = 0.035 + 0.025 * clamp(audioSwell, 0.0, 1.0);
    float drift = 0.25 * sceneTime + 1.0 * audioAdvance;
    vec3 ro = vec3(0.6 * sin(0.03 * drift), 0.5 * cos(0.025 * drift), drift);
    vec3 rd = normalize(vec3(p, 1.1));
    rd.xz = rot2(0.3 * sin(0.021 * sceneTime)) * rd.xz;
    rd.yz = rot2(0.2 * sin(0.017 * sceneTime + 2.0)) * rd.yz;
    rd.xy = rot2(0.012 * sceneTime) * rd.xy;
    vec3 col = vec3(0.0);
    float t = 0.05 + 0.05 * hash21(gl_FragCoord.xy);                 // dithered: fewer steps without banding
    for (int i = 0; i < 26; ++i) {
        vec3 x = (ro + rd * t) / S;
        vec3 c0 = floor(x);
        float d1 = 1e9, d2 = 1e9, d3 = 1e9;
        vec3 n1 = vec3(0.0);
        for (int k = 0; k < 27; ++k) {
            vec3 o = vec3(float(k % 3), float((k / 3) % 3), float(k / 9)) - 1.0;
            vec3 c = c0 + o;
            vec3 hh = cellHash(c);
            float ph = wph * (0.5 + hh.z) + 6.2831853 * hh.y;            // one phase per cell, a loop in its own plane
            vec3 seed = c + 0.5 + (hh - 0.5) * 0.4 + roam * (sin(ph) * vec3(0.8, 0.3, -0.5) + cos(ph) * (hh.zxy - 0.5));
            float d = length(x - seed);
            if (d < d1) { d3 = d2; d2 = d1; d1 = d; n1 = c; }
            else if (d < d2) { d3 = d2; d2 = d; }
            else if (d < d3) { d3 = d; }
        }
        float e = 0.5 * (d3 - d1) * S;                         // the way to the nearest edge (roughly)
        float f = 0.5 * (d2 - d1) * S;                         // the way to the nearest membrane
        float g = exp(-pow(e / width, 2.0)) + 0.25 * width * width / (width * width + e * e);
        float m = memb * 0.12 * exp(-pow(f / (0.6 * width), 2.0));
        vec3 photo = imgLod(n1.xy * 0.13 + 0.5 + 0.07 * n1.z, 3.0);
        float fade = exp(-0.1 * t) * smoothstep(0.05, 0.6, t);
        float dt = clamp(0.6 * min(e, f + 0.03), 0.11, 0.7);
        col += famLight(fh, 0.15 + 0.7 * luma(photo), 0.3 * g / (1.0 + g)) * (g + m) * fade * 0.07 * (dt / 0.05);   // glow by the way gone
        t += dt;
        if (t > 14.0) break;
    }
    col += famCol(fh, 0.5) * 0.012;
    finish(col);
}
