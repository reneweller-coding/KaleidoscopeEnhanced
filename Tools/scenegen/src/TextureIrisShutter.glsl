//@doc
 * @brief TEXTURE IRIS SHUTTER: an endless nest of camera irises -- a ring of
 * overlapping metal blades (each a sheet of the photograph, polished and
 * darkened like blued steel) forms a turning polygonal aperture that
 * slowly opens and closes; through the aperture lies the next iris, and
 * the next, and we drift inward through them forever.  Each iris has its
 * own blade count and turn; the blades' edges catch a bright line of
 * light.  The blades continue beyond the frame; mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the drift inward (integrated, jump-free)
 *   audioPhase      -> the irises turn (integrated)
 *   audioSpread     -> the apertures open wider
 *   audioKick       -> the blade edges flash (light)
 *   audioMode       -> the steel: cold blue in minor, bronze in major
 *   audioSwell      -> the light shining through from the far centre (slow)
 *
 * Knobs: bladesP (blade count), curveP (blade curvature), photoP (photo on the blades), hueP.
//@params bladesP curveP photoP
//@audio audioPhase audioSpread audioKick audioMode audioSwell
//@body
// One iris (level m) at local coordinates q: returns colour, alpha (0 in the aperture).
vec4 iris(vec2 q, float m, float px)
{
    float hm = hash11(m * 0.731 + 0.2);
    float N = floor(6.0 + 6.0 * clamp(bladesP + 0.5 * (hm - 0.5), 0.0, 1.0));
    float rot = 0.05 * sceneTime * (hm > 0.5 ? 1.0 : -1.0) + 0.4 * audioPhase + hm * 6.28;
    float R = (0.2 + 0.12 * clamp(audioSpread, 0.0, 1.0)) * (0.8 + 0.25 * sin(0.2 * sceneTime + m * 2.1));
    float curv = (0.3 + 1.2 * clamp(curveP, 0.0, 1.0)) / R * 0.3;
    float halfSide = R * tan(3.14159265 / N);
    // Every blade whose edge lies behind the point covers it; the visible
    // one is chosen by a skewed score, which turns the blade borders into a
    // pinwheel.  The gap to the runner-up shades the overlap.
    float vis = -1.0, dv = 0.0, tv = 0.0;
    float best = 1e3, second = 1e3;
    float skew = 0.9;
    for (int i = 0; i < 16; ++i) {
        if (float(i) >= N) break;
        float ph = rot + float(i) * 6.2831853 / N;
        vec2 n = vec2(cos(ph), sin(ph)), t = vec2(-n.y, n.x);
        float tt = dot(q, t);
        float d = dot(q, n) - R + curv * tt * tt * 0.3;
        if (d <= 0.0) continue;
        float sc = d - skew * tt;
        if (sc < best) { second = best; best = sc; vis = float(i); dv = d; tv = tt; }
        else if (sc < second) second = sc;
    }
    if (vis < 0.0) return vec4(0.0);                            // inside the aperture
    float dn = -(second - best);                                // <= 0, 0 on a blade border
    // The blade: a sheet of the photo in the blade's own frame.
    float ph = rot + vis * 6.2831853 / N;
    vec2 buv = rot2(-ph) * q * 1.2 + vec2(hash11(vis + m * 3.0), hash11(vis * 1.7 + m)) + 0.5;
    vec3 photo = imgLod(buv, 1.5);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 steel = mix(vec3(0.3, 0.45, 0.8), vec3(0.9, 0.55, 0.25), mode);
    vec3 c = mix(steel * (0.4 + 0.8 * luma(photo)), photo * 1.1, 0.5 * clamp(photoP, 0.0, 1.0));
    // Sheen across the blade and shading by its tilt.
    c *= 0.55 + 0.5 * (0.5 + 0.5 * sin(tv * 6.0 / R + vis * 1.3 + 0.1 * sceneTime));
    c *= 0.6 + 0.4 * smoothstep(0.0, R * 0.3, dv);             // shadow near the edge (depth)
    c *= 0.7 + 0.45 * hash11(vis * 3.1 + m);                    // each blade its own tone
    c *= 1.0 - 0.6 * exp(dn / (R * 0.06)) * step(dn, 0.0);     // shadow of the blade lying over it
    vec3 edgeC = glowColour(imgLod(vec2(0.5), 6.0), vec2(m, vis) * 0.3, hueP * 0.159);
    float edge = exp(-dv / (px * 2.5)) + 0.3 * exp(-dv / (px * 12.0));
    c += mix(edgeC, vec3(1.0), 0.4) * edge * (0.5 + 1.3 * clamp(audioKick, 0.0, 1.0));
    return vec4(c, 1.0);
}

void main()
{
    vec2 p = screenP();
    float swell = clamp(audioSwell, 0.0, 1.0);
    float K = 3.2;
    float flow = 0.05 * sceneTime + 0.3 * audioAdvance;
    float f = fract(flow);
    float m0 = floor(flow);                                  // level identity (matches across the wrap)
    vec3 acc = vec3(0.0);
    float trans = 1.0;
    for (int j = 0; j < 5; ++j) {
        float fj = float(j);
        float size = pow(K, f - fj);
        vec2 q = p / size;
        float px = 1.0 / resolution.y / size;
        vec4 c = iris(q, m0 + fj, px);
        float a = c.a * (j == 0 ? 1.0 - smoothstep(0.75, 1.0, f) : 1.0);
        acc += trans * a * c.rgb;
        trans *= 1.0 - a;
        if (trans < 0.01) break;
    }
    // Light from the far centre.
    vec3 lc = glowColour(imgLod(vec2(0.5 + 0.1 * sin(0.03 * sceneTime), 0.5), 5.0), p, hueP * 0.159);
    acc += trans * lc * (0.5 + 0.8 * swell);
    finish(acc);
}
