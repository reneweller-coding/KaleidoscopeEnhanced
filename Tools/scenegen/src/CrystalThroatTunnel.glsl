//@doc
 * @brief CRYSTAL THROAT TUNNEL: flying down a throat of crystal -- the tunnel
 * wall is lined with prismatic crystal facets (hexagonal columns seen end
 * on, their faces tilted), each facet showing the photograph refracted
 * and split into its spectral colours at the facet edges, the facets
 * glinting as we pass, the whole throat slowly turning; a white light
 * burns at the far end.  Endless, mirrorable; the wall continues beyond
 * the frame.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flight (integrated, jump-free)
 *   audioPhase      -> the throat turns (integrated)
 *   audioSpread     -> the dispersion (spectral fringes)
 *   audioKick       -> the facets glint (light)
 *   audioMode       -> the crystal: cool quartz in minor, citrine in major
 *   audioSwell      -> the light at the end (slow)
 *
 * Knobs: facetP (facet size), tiltP (facet tilt), wallZoomP, hueP.
//@params facetP tiltP wallZoomP
//@audio audioPhase audioSpread audioKick audioMode audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float r = max(length(p), 1e-4);
    float a = atan(p.y, p.x) + 0.02 * sceneTime + 0.2 * audioPhase;
    vec2 cs = vec2(cos(a), sin(a));
    float z = 0.5 / r;
    float travel = 0.4 * sceneTime + 3.0 * audioAdvance;
    // Wall coordinates: around (a, period 2 in units of pi) x along (depth).
    float n = 2.0 * floor(6.0 + 6.0 * (1.0 - clamp(facetP, 0.0, 1.0)));   // facets around (even)
    vec2 w = vec2(a / 6.2831853 * n, (z + travel) * n / 6.2831853 * 1.1);
    // Hex facets on the wall.
    const vec2 s = vec2(1.0, 1.7320508);
    vec2 ha = mod(w, s) - s * 0.5;
    vec2 hb = mod(w - s * 0.5, s) - s * 0.5;
    vec2 h = dot(ha, ha) < dot(hb, hb) ? ha : hb;
    vec2 cid = w - h;
    cid = floor(cid / (s * 0.5) + 0.5) * (s * 0.5);
    float cidA = mod(cid.x, n);                                // wraps with the circle
    float hh = hash21(vec2(cidA, cid.y));
    // Facet tilt: each facet a tilted plane; refraction offset proportional to it.
    vec2 tilt = (vec2(hash21(vec2(cidA, cid.y) + 3.0), hash21(vec2(cidA, cid.y) + 7.0)) - 0.5) * (0.3 + 0.7 * clamp(tiltP, 0.0, 1.0));
    float disp = 0.005 + 0.02 * clamp(audioSpread, 0.0, 1.0);
    float zoom = 0.3 + 0.4 * clamp(wallZoomP, 0.0, 1.0);
    vec2 uv = vec2(a / 3.14159265, (z + travel) * zoom * 0.3) + tilt * 0.08;
    float fw = max(length(fwidth(cs)) / 3.14159265, fwidth(z) * zoom * 0.3) * 1024.0;
    float lod = clamp(log2(max(fw, 1.0)), 0.0, 9.0);
    // Dispersion: the three colour channels refracted slightly differently.
    vec3 col;
    col.r = imgLod(uv + tilt * disp * 1.0, lod).r;
    col.g = imgLod(uv, lod).g;
    col.b = imgLod(uv - tilt * disp * 1.0, lod).b;
    vec3 cr = mix(vec3(0.85, 0.92, 1.1), vec3(1.1, 0.95, 0.65), mode);
    col *= cr;
    // Facet shading and edges with spectral fringes.
    float hexD = max(abs(h.x), abs(h.x) * 0.5 + abs(h.y) * 0.866);
    float face = 0.6 + 0.5 * dot(normalize(vec3(tilt, 1.0)), normalize(vec3(sin(travel * 0.3), cos(travel * 0.2), 0.8)));
    col *= face;
    float px = (length(fwidth(cs)) / 6.2831853 * n + fwidth(w.y)) * 1.2 + 1e-4;
    float edge = exp(-(0.5 - hexD) / (px * 2.0 + 0.01));
    vec3 spec = hsv2rgb(vec3(fract(hexD * 3.0 + hh + hueP * 0.159), 0.8, 1.0));
    col += spec * edge * (0.25 + 0.8 * kick);
    col += vec3(1.0) * pow(max(0.0, face - 0.9), 3.0) * 20.0 * (0.3 + kick) * step(0.7, hh);
    // Depth and the white light at the end.
    vec3 light = mix(cr, vec3(1.0), 0.6) * (0.4 + 0.8 * swell);
    col = mix(light * 0.3, col, exp(-z * 0.1));
    col += light * exp(-r * 12.0) * 1.5;
    finish(col);
}
