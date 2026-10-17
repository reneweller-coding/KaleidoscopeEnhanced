//@doc
 * @brief YOSHIMURA BUCKLING: the Yoshimura pattern -- a thin cylinder crushed along its axis buckles into a lattice of
 * diamond facets, each folded inward along its diagonal.  Seen from inside the cylinder as an endless tunnel: the
 * diamonds stream past toward the vanishing point, each facet lit at its own angle, the photo printed on the shell.
 * The crush comes and goes, the facets fold deeper and flatten.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the crush: the facets fold deeper in loud passages (slow, no jolt)
 *   audioAdvance    -> the flight down the tunnel (integrated)
 *   audioPhase      -> the tunnel turns (integrated)
 *   audioKick       -> the folds flash (light)
 *
 * Knobs: aroundP (diamonds round the tunnel), depthP (the base fold depth), photoP (photo share), hueP.
//@params aroundP depthP photoP
//@audio audioSwell audioKick
//@body
void main()
{
    vec2 p = screenP();
    float r = max(length(p), 1e-3), a = atan(p.y, p.x) + 0.03 * audioPhase + 0.01 * sceneTime;
    float z = 0.35 / r + 0.3 * sceneTime + 0.05 * audioAdvance;  // depth along the tunnel
    float n = 8.0 + floor(10.0 * clamp(aroundP, 0.0, 1.0));
    vec2 q = vec2(a / 6.2831853 * n, z * n / 6.2831853 * 2.0);
    // the diamond lattice: rotate the (around, along) grid by 45 degrees
    vec2 d = vec2(q.x + q.y, q.x - q.y);
    vec2 f = fract(d) - 0.5;
    // each diamond folds along its diagonal: the facet's normal tilts one way on either side
    float depth = (0.3 + 0.5 * clamp(depthP, 0.0, 1.0)) * (0.5 + 0.8 * clamp(audioSwell, 0.0, 1.0));
    float side = sign(f.x);
    vec3 nrm = normalize(vec3(side * depth, -0.5 * depth * sign(f.y), 1.0));
    vec3 l = normalize(vec3(0.3, 0.6, 1.0));
    float shade = 0.35 + 0.65 * max(dot(nrm, l), 0.0);
    vec2 uv = vec2(a / 6.2831853 + 0.5, fract(z * 0.1)) * vec2(1.0, 0.9);
    uv = vec2(abs(uv.x * 2.0 - 1.0), uv.y);                     // mirrored round the tunnel: no seam
    vec3 photo = imgLod(uv + f * 0.03, 0.5);
    vec3 tone = imgPalette(fract(floor(d.x) * 0.13 + floor(d.y) * 0.07) + 0.03 * audioPhase);
    vec3 col = mix(tone * 1.1, photo * 1.2, 0.4 + 0.5 * clamp(photoP, 0.0, 1.0)) * shade;
    float fold = 1.0 - smoothstep(0.0, 0.04, min(abs(f.x), 0.5 - max(abs(f.x), abs(f.y))));
    col += mix(tone, vec3(1.0), 0.6) * fold * 0.3 * (0.4 + clamp(audioKick, 0.0, 1.0));
    col *= smoothstep(0.0, 0.08, r);                            // the vanishing point fades to dark
    finish(col);
}
