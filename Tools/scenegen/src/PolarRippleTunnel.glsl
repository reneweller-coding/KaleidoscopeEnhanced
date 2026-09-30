//@doc
 * @brief POLAR RIPPLE TUNNEL: a tunnel whose wall is a rippling liquid
 * surface -- concentric waves run along it toward us, the photograph
 * lining it bent and magnified by every wave, bright caustic rings
 * focusing where the waves crest, the wall shimmering like the inside of
 * a water pipe lit from outside.  Endless, mirrorable; the wall continues
 * beyond the frame.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flight (integrated, jump-free)
 *   audioPhase      -> the ripples travel (integrated)
 *   audioSpread     -> ripple height
 *   audioKick       -> the caustic rings flare (light)
 *   audioMode       -> the light: cool in minor, warm in major
 *   audioSwell      -> depth glow (slow)
 *
 * Knobs: rippleP (ripple wavelength), lobeP (lobes around the tunnel), wallZoomP, hueP.
//@params rippleP lobeP wallZoomP
//@audio audioPhase audioSpread audioKick audioMode audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float r = max(length(p), 1e-4);
    float a = atan(p.y, p.x);
    vec2 cs = vec2(cos(a), sin(a));
    float z = 0.5 / r;
    float travel = 0.4 * sceneTime + 3.0 * audioAdvance;
    float wz = z + travel;
    float k = 2.0 + 4.0 * clamp(rippleP, 0.0, 1.0);
    float lobes = 2.0 * floor(1.0 + 2.0 * clamp(lobeP, 0.0, 1.0));   // even
    float ph = 1.5 * sceneTime + 6.0 * audioPhase;
    float amp = 0.03 + 0.07 * clamp(audioSpread, 0.0, 1.0);
    // Height of the wall and its slopes (along depth and around).
    float h = sin(wz * k - ph) * (0.7 + 0.3 * cos(lobes * a + 0.3 * sceneTime));
    float dhz = k * cos(wz * k - ph) * (0.7 + 0.3 * cos(lobes * a + 0.3 * sceneTime));
    float dha = -0.3 * lobes * sin(wz * k - ph) * sin(lobes * a + 0.3 * sceneTime);
    // Refraction: the photo is shifted by the slope.
    float wzoom = 0.3 + 0.4 * clamp(wallZoomP, 0.0, 1.0);
    vec2 uv = vec2(a / 3.14159265 + amp * dha * 0.1, wz * wzoom * 0.5 + amp * dhz * 0.4);
    float fw = max(length(fwidth(cs)) / 3.14159265, fwidth(z) * wzoom * 0.5) * 1024.0;
    vec3 wall = imgLod(uv, clamp(log2(max(fw, 1.0)), 0.0, 9.0));
    vec3 lc = mix(vec3(0.7, 0.85, 1.1), vec3(1.15, 0.9, 0.7), mode);
    vec3 col = wall * lc * (0.75 + 0.35 * h);
    // Caustic rings where the wave focuses light (curvature high, crest).
    float curv = -k * k * sin(wz * k - ph);
    float caustic = pow(max(0.0, curv / (k * k)), 6.0);
    vec3 gc = glowColour(imgLod(vec2(0.5 + 0.1 * sin(0.02 * sceneTime), 0.5), 6.0), vec2(travel * 0.03, 0.0), hueP * 0.159);
    col += mix(gc, vec3(1.0), 0.4) * caustic * (0.2 + 0.9 * kick) * (0.7 + 0.3 * cos(lobes * a + 0.3 * sceneTime));
    // Depth fog and glow.
    float fog = exp(-z * 0.12);
    col = mix(gc * (0.12 + 0.5 * swell), col, fog);
    col += gc * exp(-r * 14.0) * (0.4 + swell);
    finish(col);
}
