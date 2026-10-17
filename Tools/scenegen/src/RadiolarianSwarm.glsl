//@doc
 * @brief RADIOLARIAN SWARM: a field of radiolarian skeletons drifting in the deep -- glassy lattice spheres, their
 * shells pierced by rings of pores like a geodesic dome, long spines standing out from them, each turning slowly on
 * its own axis.  They hang at different depths, the far ones small and dim and soft, the near ones large and crisp;
 * through the pores of the front of each shell the back of it shows.  The photo colours the glass.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the skeletons turn (integrated)
 *   audioAdvance    -> the swarm drifts past (integrated)
 *   audioKick       -> the spines' tips flash (light)
 *
 * Knobs: poresP (how many pores), spinesP (how long the spines), photoP (photo share), hueP.
//@params poresP spinesP photoP
//@audio audioKick
//@body
/**  The nearest and the second-nearest of N points spread evenly on the sphere (a Fibonacci sphere).
 *
 * @param n  The direction (unit). (in)
 * @param N  The points. (in)
 *
 * @return
 *   The nearest distance (x), the second-nearest (y), the nearest point's index (z).
 **/
vec3 fibNearest(vec3 n, float N)
{
    float best = 1e9, second = 1e9, bi = 0.0;
    for (int i = 0; i < 48; ++i) {
        if (float(i) >= N) break;
        float fi = float(i) + 0.5;
        float z = 1.0 - 2.0 * fi / N, rr = sqrt(max(1.0 - z * z, 0.0));
        float ph = 2.3999632 * fi;
        vec3 c = vec3(rr * cos(ph), rr * sin(ph), z);
        float d = length(n - c);
        if (d < best) { second = best; best = d; bi = float(i); } else if (d < second) second = d;
    }
    return vec3(best, second, bi);
}

void main()
{
    vec2 p = screenP();
    float N = floor(18.0 + 30.0 * clamp(poresP, 0.0, 1.0));
    float spineL = 0.3 + 0.5 * clamp(spinesP, 0.0, 1.0);
    vec3 tone = imgPalette(0.55 + 0.03 * audioPhase);
    vec3 col = imgLod(p * 0.3 + 0.5, 5.0) * 0.08 + tone * 0.05;
    // three depth layers, the far first
    for (int layer = 0; layer < 3; ++layer) {
        float fl = float(layer);
        float S = 0.24 + 0.16 * fl;                             // the near ones larger
        float fog = 0.35 + 0.32 * fl;
        vec2 drift = vec2(0.02 + 0.015 * fl, 0.006) * (sceneTime + 3.0 * audioAdvance);
        vec2 q = p + drift + fl * vec2(0.37, 0.71);
        vec2 cell = floor(q / S);
        for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
            vec2 cc = cell + vec2(float(i), float(j));
            vec2 hh = hash22(cc + fl * 11.0);
            if (hh.x < 0.35) continue;                          // not every cell holds one
            vec2 c = (cc + 0.5 + 0.4 * (hh - 0.5)) * S;
            float R = S * (0.22 + 0.1 * hh.y);
            vec2 d = (q - c) / R;
            float r2 = dot(d, d);
            mat2 rot = rot2(0.02 * audioPhase * (hh.y - 0.4) + 6.2831853 * hh.x);
            // the spines: rays out of the shell at a few of the points
            float spine = 0.0;
            for (int s = 0; s < 6; ++s) {
                float a = 6.2831853 * (float(s) + hh.y) / 6.0 + 0.03 * audioPhase * (hh.x - 0.5) + 0.05 * sceneTime * (hh.y - 0.5);
                vec2 dir = vec2(cos(a), sin(a));
                float along = dot(d, dir), acr = abs(dot(d, vec2(-dir.y, dir.x)));
                float len = 1.0 + spineL * (0.6 + 0.8 * hash11(hh.x * 9.0 + float(s)));
                spine = max(spine, smoothstep(0.05, 0.0, acr - 0.03 * (len - along)) * smoothstep(0.85, 0.95, along) * smoothstep(len, len - 0.05, along));
            }
            if (r2 > 1.0 && spine < 0.01) continue;
            vec3 cg = mix(tone * 1.2, imgLod(c * 0.5 + 0.5, 1.5) * 1.5, 0.5 + 0.45 * clamp(photoP, 0.0, 1.0));
            if (r2 <= 1.0) {
                float z = sqrt(1.0 - r2);
                vec3 nf = vec3(d, z), nb = vec3(d, -z);
                nf.xy = rot * nf.xy; nb.xy = rot * nb.xy;
                vec3 f1 = fibNearest(nf, N), f2 = fibNearest(nb, N);
                float barF = smoothstep(0.06, 0.02, f1.y - f1.x);   // the lattice between the pores
                float barB = smoothstep(0.06, 0.02, f2.y - f2.x);
                float glassF = barF * (0.55 + 0.45 * z), glassB = barB * 0.45;
                vec3 g = cg * max(glassF, glassB * (1.0 - glassF)) + cg * pow(1.0 - z, 3.0) * 0.6;
                col = mix(col, g * fog, clamp(max(glassF, glassB * 0.6) + pow(1.0 - z, 3.0) * 0.5, 0.0, 1.0));
            }
            vec3 sc = mix(cg, vec3(1.0), 0.4) * (0.8 + 0.6 * clamp(audioKick, 0.0, 1.0));
            col = mix(col, sc * fog, spine * 0.9);
        }
    }
    finish(col * 1.15);
}
