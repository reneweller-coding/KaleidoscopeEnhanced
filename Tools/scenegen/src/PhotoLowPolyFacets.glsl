//@doc
 * @brief PHOTO LOW POLY FACETS: the photograph as low-poly art -- the
 * picture broken into a mesh of triangles, each filled with the average
 * colour of the photo beneath it and shaded like a faceted crystal
 * surface catching a moving light; the mesh vertices drift, so the
 * facets slowly shift and re-form, some facets flashing as they tilt into
 * the light.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the vertices drift (integrated, jump-free)
 *   audioSpread     -> facet size
 *   audioKick       -> facets flash (light)
 *   audioMode       -> the light: cool in minor, warm in major
 *   audioRoughness  -> the facets tilt more
 *   audioSwell      -> edge lines (slow)
 *
 * Knobs: facetP (facet density), reliefP (faceting relief), edgeP (edge lines), hueP.
//@params facetP reliefP edgeP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float S = (5.0 + 8.0 * clamp(facetP, 0.0, 1.0)) * (1.2 - 0.5 * clamp(audioSpread, 0.0, 1.0));
    vec2 g = p * S;
    float T = 0.05 * sceneTime + 0.35 * audioAdvance;
    // Triangulated jittered grid: vertices move; each square split along its diagonal.
    vec2 gi = floor(g);
    // The moved mesh: search the quads around the pixel for the triangle that
    // contains it (barycentric test), so every pixel gets its true facet.
    vec2 A = vec2(0.0), B = vec2(0.0), C = vec2(0.0);
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 q0 = gi + vec2(i, j);
        vec2 cs[4];
        cs[0] = q0; cs[1] = q0 + vec2(1.0, 0.0); cs[2] = q0 + vec2(0.0, 1.0); cs[3] = q0 + vec2(1.0, 1.0);
        vec2 P[4];
        for (int k = 0; k < 4; ++k) P[k] = cs[k] + 0.25 * vec2(sin(T + hash21(cs[k]) * 6.28), cos(T * 0.8 + hash21(cs[k] + 1.0) * 6.28));
        for (int t = 0; t < 2; ++t) {
            vec2 a = P[0], b = t == 0 ? P[1] : P[2], c = P[3];
            vec2 v0 = b - a, v1 = c - a, v2 = g - a;
            float den = v0.x * v1.y - v1.x * v0.y;
            float u = (v2.x * v1.y - v1.x * v2.y) / den;
            float v = (v0.x * v2.y - v2.x * v0.y) / den;
            if (u >= -0.001 && v >= -0.001 && u + v <= 1.001) { A = a; B = b; C = c; }
        }
    }
    vec2 cen = (A + B + C) / 3.0;
    vec2 uv = cen / S * 0.5 + 0.5;
    vec3 fc = imgLod(uv, 3.0);
    // Facet normal from the photo's luma at the corners (a height field).
    float hA = luma(imgLod(A / S * 0.5 + 0.5, 3.0)), hB = luma(imgLod(B / S * 0.5 + 0.5, 3.0)), hC = luma(imgLod(C / S * 0.5 + 0.5, 3.0));
    float relief = (0.5 + 1.5 * clamp(reliefP, 0.0, 1.0)) * (1.0 + rough);
    vec3 n = normalize(cross(vec3(B - A, (hB - hA) * relief), vec3(C - A, (hC - hA) * relief)));
    if (n.z < 0.0) n = -n;
    float la = 0.2 * sceneTime + 0.8 * audioAdvance;
    vec3 L = normalize(vec3(cos(la), sin(la), 1.2));
    float diff = max(dot(n, L), 0.0);
    float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 16.0);
    vec3 lc = mix(vec3(0.85, 0.92, 1.1), vec3(1.1, 0.95, 0.8), mode);
    vec3 col = fc * lc * (0.45 + 0.75 * diff) + lc * spec * (0.15 + 0.8 * kick);
    // Edges.
    float dE = min(min(sdSeg(g, A, B), sdSeg(g, B, C)), sdSeg(g, C, A));
    float px = fwidth(g.x) * 1.2;
    col = mix(col, col * 0.6, smoothstep(px * 1.5, 0.0, dE) * (0.2 + 0.6 * clamp(edgeP, 0.0, 1.0)) * (0.5 + swell));
    col = mix(col, col * glowColour(fc, cen * 0.1, hueP * 0.159) * 1.2, 0.05);
    finish(col);
}
