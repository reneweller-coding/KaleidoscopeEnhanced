//@doc
 * @brief ALLEN CAHN COARSENING: Allen-Cahn: two phases that coarsen into large domains, with borders that move by their curvature; the photo sets the preference and colours the domains.  Where the photo is bright one phase is slightly favoured, so the domains follow the photo's shapes more and more
 * as they grow.  The borders glow.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the coarsening runs on: the pace of the steps (integrated through the clock)
 *   audioSpread  -> the width of the borders
 *
 * Knobs: scaleP (cell size), hueP.
//@params scaleP
//@audio audioSpread
//@state 320 180 60 32
//@body
vec3 phAt(vec2 c, float lod) { return imgLod((c - 0.5 * stateRes) / stateRes.y * 0.8 + 0.5, lod); }
vec4 stateStep()
{
    ivec2 ip = stCell();
    if (stateFrame < 0.5) return vec4(0.6 * (stRand(0) - 0.5), 0.0, 0.0, 1.0);
    float u = stAt(ip).r;
    vec4 lap = stLap(ip);
    float l = luma(phAt(vec2(ip) + 0.5, 1.5));
    float D = 2.2 + 1.6 * clamp(audioSpread, 0.0, 1.0);
    float bias = 0.35 * (l - 0.5);
    float dt = 0.06;
    float nu = u + dt * (D * lap.r + u - u * u * u + bias);
    nu += 0.002 * (stRand(1) - 0.5);
    return vec4(clamp(nu, -1.2, 1.2), 0.0, 0.0, 1.0);
}
void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float zoom = 1.0 - 0.45 * clamp(scaleP, 0.0, 1.0);
    vec2 cc = stView(p, zoom);
    vec4 s = stLin(cc);
    vec3 ph = phAt(cc, 0.8);
    float side = smoothstep(-0.4, 0.4, s.r);
    float wall = exp(-s.r * s.r * 6.0);
    vec3 col = mix(ph * 0.35, ph * 1.2, side) + imgPalette(0.6) * wall * 0.35;
    finish(col);
}
