//@doc
 * @brief PHYLLOTAXIS SPHERE NEST: spheres of light nested inside each other, each covered with points in the
 * sunflower's spiral (the spherical Fibonacci lattice), and the eye sinks into the nest without end -- every shell
 * grows toward it and passes through it while new ones open at the heart, each a fixed factor smaller than the
 * last.  Every shell turns on its own; a ray meets each shell at most twice, and the nearest lattice point to each
 * meeting is found directly by Keinert's inverse spherical Fibonacci mapping.  One colour family from the photo,
 * a shade per shell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the spirals lean: each chord change glides a twist that shears the lattice from pole to pole
 *                       (as if the divergence angle wavered round the golden angle)
 *   audioAdvance     -> the sinking (integrated) and the shells' turning
 *   audioOnset       -> a scattering of points flares up
 *
 * Knobs: pointP (how many points per shell), sizeP (the points' size), hueP.  Distinct from PhyllotaxisZoom, which
 * is flat.
//@params pointP sizeP
//@audio audioHarmAdvance audioOnset
//@body
/**  The fractional part of a product.
 *
 * @param a  One factor. (in)
 * @param b  The other. (in)
 *
 * @return
 *   fract(a b).
 **/
float madfrac(float a, float b)
{
    return a * b - floor(a * b);
}

/**  The nearest point of the spherical Fibonacci lattice of n points (Keinert et al. 2015, inverse mapping).
 *
 * @param p  The unit direction. (in)
 * @param n  The number of points. (in)
 * @param q  Returns the nearest lattice point. (out)
 *
 * @return
 *   The nearest point's index.
 **/
float inverseSF(vec3 p, float n, out vec3 q)
{
    const float PHI = 1.6180339887;
    const float PI = 3.14159265;
    float m = 1.0 - 1.0 / n;
    float phi = min(atan(p.y, p.x), PI);
    float cosTheta = p.z;
    float k = max(2.0, floor(log(n * PI * sqrt(5.0) * (1.0 - cosTheta * cosTheta)) / log(PHI * PHI)));
    float Fk = pow(PHI, k) / sqrt(5.0);
    vec2 F = vec2(floor(Fk + 0.5), floor(Fk * PHI + 0.5));
    vec2 ka = 2.0 * F / n;
    vec2 kb = 2.0 * PI * (fract((F + 1.0) * PHI) - (PHI - 1.0));
    mat2 iB = mat2(ka.y, -ka.x, kb.y, -kb.x) / (ka.y * kb.x - ka.x * kb.y);
    vec2 c = floor(iB * vec2(phi, cosTheta - m));
    float best = 8.0, j = 0.0;
    q = vec3(0.0, 0.0, 1.0);
    for (int s = 0; s < 4; ++s) {
        vec2 uv = vec2(float(s - 2 * (s / 2)), float(s / 2));
        float i = clamp(dot(F, uv + c), 0.0, n - 1.0);
        float ph = 2.0 * PI * madfrac(i, PHI - 1.0);
        float ct = m - 2.0 * i / n;
        float st = sqrt(max(1.0 - ct * ct, 0.0));
        vec3 cand = vec3(cos(ph) * st, sin(ph) * st, ct);
        float dd = dot(cand - p, cand - p);
        if (dd < best) { best = dd; q = cand; j = i; }
    }
    return j;
}

/**  A shell's light where a ray meets it.
 *
 * @param n      The unit direction from the nest's centre. (in)
 * @param K      The shell's number. (in)
 * @param spin   The shells' turning phase. (in)
 * @param tw     The lattice's twist (pole to pole). (in)
 * @param N      The points per shell. (in)
 * @param dotR   The points' angular radius. (in)
 * @param flare  The onsets' flare. (in)
 *
 * @return
 *   The light (x) and the point's own hash (y).
 **/
vec2 shellLight(vec3 n, float K, float spin, float tw, float N, float dotR, float flare)
{
    float hk = fract(sin(K * 12.9898) * 43758.5453);
    n.xy = rot2(spin * (0.5 + hk) * (hk < 0.5 ? -1.0 : 1.0) + 6.2831853 * hk) * n.xy;
    n.yz = rot2(1.3 * hk) * n.yz;
    n.xy = rot2(tw * n.z) * n.xy;                                // the twist: the spirals lean
    vec3 q;
    float j = inverseSF(n, N, q);
    float d = length(n - q);
    float hj = fract(sin(j * 78.233 + K * 37.719) * 43758.5453);
    float g = exp(-pow(d / dotR, 2.0)) + 0.04 * dotR * dotR / (dotR * dotR + d * d);
    return vec2(g * (1.0 + flare * smoothstep(0.82, 0.97, hj)), hj);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    const float LAM = 0.36;                                      // shell to shell: radius times e^0.36
    float N = floor(260.0 + 320.0 * clamp(pointP, 0.0, 1.0));
    float dotR = (0.16 + 0.12 * clamp(sizeP, 0.0, 1.0)) * sqrt(4.0 * 3.14159265 / N) * 0.5;
    float h = max(audioHarmAdvance, 0.0);
    float tw = 0.9 * sin(0.7 * h) + 0.4 * sin(0.29 * h + 1.0);
    float sink = 0.06 * sceneTime + 0.3 * audioAdvance;          // in shells
    float spin = 0.04 * sceneTime + 0.25 * audioAdvance;
    float flare = 2.5 * clamp(audioOnset, 0.0, 1.0);
    // the eye: at distance 1 from the centre, circling slowly, looking past the centre
    vec3 o = vec3(0.0, 0.0, -1.0);
    o.xz = rot2(0.05 * sceneTime) * o.xz;
    o.yz = rot2(0.3 * sin(0.03 * sceneTime)) * o.yz;
    vec3 fw = normalize(-o + 0.25 * vec3(sin(0.04 * sceneTime), cos(0.033 * sceneTime), 0.0));
    vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(rt, fw);
    vec3 rd = normalize(fw * 0.9 + rt * p.x + up * p.y);
    float u = fract(sink);
    float K0 = floor(sink);
    vec3 col = vec3(0.0);
    float b = dot(o, rd);
    for (int k = 0; k < 18; ++k) {
        float e = float(k) - 12.0;                               // radius exp(LAM (e + u)): from tiny to around the eye
        float r = exp(LAM * (e + u));
        float c = dot(o, o) - r * r;
        float disc = b * b - c;
        if (disc <= 0.0) continue;
        float sq = sqrt(disc);
        float K = e - K0;                                        // the shell's identity (fixed while it grows)
        float near = smoothstep(0.0, 0.25, abs(r - 1.0));       // a shell passing the eye fades out
        for (int s = 0; s < 2; ++s) {
            float t = s == 0 ? -b - sq : -b + sq;
            if (t <= 0.02) continue;
            vec3 n = (o + rd * t) / r;
            vec2 L = shellLight(n, K, spin, tw, N, dotR, flare);
            float fade = exp(-0.25 * t) * (s == 0 ? 1.0 : 0.55);
            float sh = fract(0.13 * K + 0.5);
            col += famLight(fh, sh, 0.2 + 0.4 * smoothstep(0.82, 0.97, L.y) * flare / 2.5) * L.x * fade * near
                   * mix(1.0, 0.0, smoothstep(4.0, 5.5, e + u));
        }
    }
    col *= 0.8;
    col += famCol(fh, 0.5) * 0.012;
    finish(col);
}
