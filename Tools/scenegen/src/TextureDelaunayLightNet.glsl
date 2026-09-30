//@doc
 * @brief TEXTURE DELAUNAY LIGHT NET: a living net of light -- glowing nodes
 * drift slowly over the dark photograph and every pair of nearby nodes is
 * joined by a thin luminous thread, fading as they move apart and
 * brightening as they approach, so the web continually re-knits itself;
 * nodes take their colour from the photo beneath them and gather more
 * densely on its bright parts; small triangles between close nodes fill
 * with a faint tinted glow.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the nodes drift (integrated, jump-free)
 *   audioSpread     -> link reach (how far threads span)
 *   audioKick       -> the nodes flash (light)
 *   audioHigh       -> the threads shimmer (light)
 *   audioMode       -> palette: cool in minor, warm in major
 *   audioSwell      -> the triangle fills (slow)
 *
 * Knobs: nodeP (node spacing), threadP (thread brightness), photoP (photo visibility), hueP.
//@params nodeP threadP photoP
//@audio audioSpread audioKick audioHigh audioMode audioSwell
//@body
float gS;
vec2 nodeAt(vec2 id, float T)
{
    vec2 h = hash22(id);
    return id + 0.5 + 0.38 * vec2(sin(T * (0.5 + h.x) + h.y * 6.28), cos(T * (0.4 + h.y) + h.x * 6.28));
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    gS = 6.0 + 6.0 * clamp(nodeP, 0.0, 1.0);
    vec2 g = p * gS + vec2(0.05, 0.03) * sceneTime;
    vec2 gi = floor(g);
    float T = 0.3 * sceneTime + 2.0 * audioAdvance;
    vec2 uv0 = p * 0.7 + 0.5;
    vec3 col = imgLod(uv0, 2.0) * (0.03 + 0.12 * clamp(photoP, 0.0, 1.0));
    vec2 P[25]; vec3 C[25];
    for (int j = 0; j < 5; ++j) for (int i = 0; i < 5; ++i) {
        vec2 id = gi + vec2(i - 2, j - 2);
        vec2 c = nodeAt(id, T);
        P[j * 5 + i] = c;
        vec2 cuv = (c - vec2(0.05, 0.03) * sceneTime) / gS * 0.7 + 0.5;
        vec3 pc = glowColour(imgLod(cuv, 3.0), c * 0.1, hueP * 0.159);
        C[j * 5 + i] = mix(pc, pc * mix(vec3(0.7, 0.9, 1.2), vec3(1.2, 0.9, 0.7), mode), 0.5);
    }
    float reach = 1.15 + 0.35 * clamp(audioSpread, 0.0, 1.0);   // <= 1.5 cells: both ends lie in the 5x5 block
    float px = gS / resolution.y * 1.5;
    float thr = 0.3 + 0.7 * clamp(threadP, 0.0, 1.0);
    for (int a = 0; a < 25; ++a) {
        for (int b = a + 1; b < 25; ++b) {
            vec2 ab = P[b] - P[a];
            float L = length(ab);
            if (L > reach) continue;
            float d = sdSeg(g, P[a], P[b]);
            float fade = smoothstep(reach, reach * 0.25, L);
            float shimmer = 0.8 + 0.2 * sin(dot(g - P[a], ab / max(L, 1e-3)) * 20.0 - sceneTime * 4.0) * hi;
            vec2 pa = g - P[a];
            float tpos = clamp(dot(pa, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
            vec3 lc = mix(C[a], C[b], tpos);
            col += lc * fade * thr * shimmer * (smoothstep(px * 1.5, 0.0, d) * 1.4 + exp(-d / (px * 5.0)) * 0.25);
        }
    }
    // Triangle fills around the cell's own node and two ring neighbours.
    int ring[9];
    ring[0] = 6; ring[1] = 7; ring[2] = 8; ring[3] = 13; ring[4] = 18; ring[5] = 17; ring[6] = 16; ring[7] = 11; ring[8] = 6;
    for (int a = 0; a < 8; ++a) {
        vec2 A = P[12], B = P[ring[a]], Cc = P[ring[a + 1]];
        vec2 e0 = B - A, e1 = Cc - B, e2 = A - Cc;
        float s0 = e0.x * (g.y - A.y) - e0.y * (g.x - A.x);
        float s1 = e1.x * (g.y - B.y) - e1.y * (g.x - B.x);
        float s2 = e2.x * (g.y - Cc.y) - e2.y * (g.x - Cc.x);
        bool inT = (s0 > 0.0 && s1 > 0.0 && s2 > 0.0) || (s0 < 0.0 && s1 < 0.0 && s2 < 0.0);
        float per = length(e0) + length(e1) + length(e2);
        if (inT && per < reach * 2.4) col += (C[12] + C[ring[a]]) * 0.5 * (0.02 + 0.08 * swell) * smoothstep(reach * 2.4, reach * 1.6, per);
    }
    // Nodes: round glows.
    for (int k = 0; k < 25; ++k) {
        float d = length(g - P[k]);
        col += C[k] * (smoothstep(px * 3.0, px, d) * 1.2 + exp(-d * 8.0) * 0.2) * (0.6 + 1.2 * kick);
    }
    finish(col);
}
