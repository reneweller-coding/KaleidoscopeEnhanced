//@doc
 * @brief TEXTURE SPHERICAL TILING: a field of turning globes -- a lattice
 * of spheres, each one tiled like a football or a disco ball with facets
 * holding the photograph, rotating on its own tilted axis, lit from one
 * side with a bright specular glint and a shadowed terminator; the
 * spheres are packed tightly and drift slowly across the view.
 * Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the globes turn (integrated, jump-free)
 *   audioSpread     -> globe size
 *   audioKick       -> the glints flash (light)
 *   audioMode       -> the light: cool in minor, warm in major
 *   audioHigh       -> facet sparkles (light)
 *   audioSwell      -> the terminator softens (slow)
 *
 * Knobs: facetP (facets), tiltP (axis tilt), mirrorP (mirror-ball vs. photo), hueP.
//@params facetP tiltP mirrorP
//@audio audioSpread audioKick audioMode audioHigh audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float S = 2.5 + 2.0 * (1.0 - clamp(audioSpread, 0.0, 1.0));
    vec2 g = p * S + vec2(0.02, 0.01) * sceneTime;
    // Hex packing of spheres.
    const vec2 s = vec2(1.0, 1.7320508);
    vec2 a = mod(g, s) - s * 0.5;
    vec2 b = mod(g - s * 0.5, s) - s * 0.5;
    vec2 l = dot(a, a) < dot(b, b) ? a : b;
    vec2 cid = g - l;
    cid = floor(cid / (s * 0.5) + 0.5) * (s * 0.5);                // exact centre: hashes must not see rounding noise
    float R = 0.49;
    float r = length(l);
    float px = fwidth(g.x) * 1.2;
    float inside = smoothstep(R + px, R - px, r);
    vec3 lc = mix(vec3(0.75, 0.88, 1.1), vec3(1.15, 0.92, 0.7), mode);
    vec3 col = vec3(0.01, 0.01, 0.015);
    // Sphere normal.
    vec2 ln = l / R;
    float zz = sqrt(max(0.0, 1.0 - dot(ln, ln)));
    vec3 n = vec3(ln, zz);
    // Rotate the sphere: tilted axis, turning.
    float h = hash21(cid);
    float tilt = (0.2 + 0.8 * clamp(tiltP, 0.0, 1.0)) * (h - 0.5) * 2.0;
    float spin = (0.5 + 0.5 * h) * (0.4 * sceneTime + 2.5 * audioAdvance) + h * 6.28;
    vec3 v = n;
    v.yz = rot2(tilt) * v.yz;
    v.xz = rot2(spin) * v.xz;
    // Facets: latitude/longitude cells (even longitudes, seamless at the wrap).
    float nf = 5.0 + 7.0 * clamp(facetP, 0.0, 1.0);
    float lat = asin(clamp(v.y, -1.0, 1.0));
    float lon = atan(v.z, v.x);
    float li = floor((lat / 3.14159265 + 0.5) * nf);
    float nLon = 2.0 * max(1.0, floor(nf * cos((li + 0.5) / nf * 3.14159265 - 1.5708)));
    float lo = floor((lon / 6.2831853 + 0.5) * nLon);
    vec2 fid = vec2(li, mod(lo, nLon));
    // Facet normal: flat per facet (mirror-ball look).
    float flat_ = hash21(fid + cid);
    vec2 fuv = vec2((lo + 0.5) / nLon, (li + 0.5) / nf);
    vec3 ph = imgLod(fuv * 0.8 + hash22(cid) * 0.5, 2.0);
    vec3 photoC = mix(ph, glowColour(ph, fid, hueP * 0.159), 0.3);
    vec3 L = normalize(vec3(-0.5, 0.6, 0.65));
    float diff = smoothstep(-0.1 - 0.3 * swell, 0.4, dot(n, L));
    vec3 sc = mix(photoC * lc, lc * (0.3 + 0.7 * flat_), clamp(mirrorP, 0.0, 1.0) * 0.6) * (0.2 + 0.9 * diff);
    // Facet edges.
    float fe = min(abs(fract((lat / 3.14159265 + 0.5) * nf) - 0.5), abs(fract((lon / 6.2831853 + 0.5) * nLon) - 0.5));
    sc *= 0.8 + 0.2 * smoothstep(0.42, 0.5, 0.5 - fe);
    // Specular glint and facet sparkles.
    float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 40.0);
    sc += vec3(1.0) * spec * (0.4 + 1.2 * kick);
    sc += vec3(1.0) * step(0.97, flat_) * pow(max(0.0, sin(sceneTime * 2.0 + flat_ * 50.0)), 8.0) * hi * diff;
    col = mix(col, sc, inside);
    // Soft contact shadow between spheres.
    col *= 1.0 - 0.3 * smoothstep(R * 0.9, R, r) * inside;
    finish(col);
}
