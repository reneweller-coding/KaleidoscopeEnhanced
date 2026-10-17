//@doc
 * @brief KURAMOTO-SIVASHINSKY CELLS: the damped Kuramoto-Sivashinsky equation in two dimensions, u_t = -s lap u -
 * lap^2 u - |grad u|^2 / 2 - c u + v . grad u -- the equation of flame fronts and falling films: a chaotic carpet of
 * cells that split, merge and drift, never settling.  The cells are lenses over the photo: each cell magnifies and
 * shifts its own patch, the ridges between them catch the light.  An endless, periodic field.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the instability s (loud passages: more, smaller, livelier cells)
 *   audioPhase      -> the direction of the drift turns (integrated): the carpet flows another way
 *   audioOnset      -> a dent pressed into the field at a wandering place (structure)
 *   audioKick       -> the ridges flash (light)
 *
 * Knobs: driftP (how fast the carpet drifts), lensP (how strongly the cells refract), scaleP (cell size), hueP.
//@params driftP lensP scaleP
//@audio audioSwell audioKick audioOnset
//@state 320 180 600 32
//@body
/**  One explicit step of the damped Kuramoto-Sivashinsky equation for this cell (the state pass); cells are 0.8
 * apart, the biharmonic is the 13-point stencil.
 *
 * @return
 *   u, 0, 0, 1.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    if (stateFrame < 0.5) return vec4(0.5 * (stRand(0) - 0.5), 0.0, 0.0, 1.0);
    float h = 0.8, h2 = h * h, h4 = h2 * h2, dt = 0.006;
    float u = stAt(ip).r;
    float e = stAt(ip + ivec2(1, 0)).r, w = stAt(ip - ivec2(1, 0)).r;
    float nn = stAt(ip + ivec2(0, 1)).r, so = stAt(ip - ivec2(0, 1)).r;
    float s4 = e + w + nn + so;
    float sd = stAt(ip + ivec2(1, 1)).r + stAt(ip - ivec2(1, 1)).r + stAt(ip + ivec2(1, -1)).r + stAt(ip + ivec2(-1, 1)).r;
    float sf = stAt(ip + ivec2(2, 0)).r + stAt(ip - ivec2(2, 0)).r + stAt(ip + ivec2(0, 2)).r + stAt(ip - ivec2(0, 2)).r;
    float lap = (s4 - 4.0 * u) / h2;
    float bih = (20.0 * u - 8.0 * s4 + 2.0 * sd + sf) / h4;
    vec2 g = vec2(e - w, nn - so) / (2.0 * h);
    float s = 0.9 + 1.0 * clamp(audioSwell, 0.0, 1.0);
    float da = 0.15 * audioPhase + 0.03 * sceneTime;
    vec2 v = (0.2 + 1.2 * clamp(driftP, 0.0, 1.0)) * vec2(cos(da), sin(da));
    float du = -s * lap - bih - 0.5 * dot(g, g) - 0.1 * u + dot(v, g);   // the damping bounds the mean
    float u2 = u + dt * du;
    // an onset: a dent at a place drawn every 40 steps
    float slot = floor(stateFrame / 40.0);
    vec2 at = vec2(hash11(slot * 3.3 + 0.2), hash11(slot * 1.9 + 0.6)) * stateRes;
    vec2 d = vec2(ip) - at;
    d -= stateRes * floor(d / stateRes + 0.5);
    if (mod(stateFrame, 40.0) < 1.0 && clamp(audioOnset, 0.0, 1.0) > 0.6) u2 -= 1.5 * exp(-dot(d, d) / 30.0);
    return vec4(clamp(u2, -60.0, 60.0), 0.0, 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float zoom = 0.4 + 0.4 * clamp(scaleP, 0.0, 1.0);
    vec2 cc = stView(p, zoom);
    float u = stLin(cc).r;
    vec2 g = vec2(stLin(cc + vec2(1.0, 0.0)).r - stLin(cc - vec2(1.0, 0.0)).r,
                  stLin(cc + vec2(0.0, 1.0)).r - stLin(cc - vec2(0.0, 1.0)).r) * 0.5;
    float lap = stLin(cc + vec2(1.0, 0.0)).r + stLin(cc - vec2(1.0, 0.0)).r + stLin(cc + vec2(0.0, 1.0)).r
                + stLin(cc - vec2(0.0, 1.0)).r - 4.0 * u;
    // each cell a lens: the photo shifted by the slope, the ridges (high curvature) lit
    vec2 uv = p * 0.7 + 0.5 + g * (0.02 + 0.06 * clamp(lensP, 0.0, 1.0)) + 0.006 * sceneTime * vec2(1.0, 0.3);
    vec3 photo = imgLod(uv, 0.5);
    float ridge = smoothstep(0.1, 0.8, -lap);
    vec3 tone = imgPalette(0.2 + 0.05 * u + 0.03 * audioPhase);
    vec3 n = normalize(vec3(-g * 1.5, 1.0));
    float shade = 0.6 + 0.4 * dot(n, normalize(vec3(0.4, 0.5, 1.0)));
    vec3 col = photo * shade * (0.8 + 0.3 * clamp(-lap, -1.0, 1.0));
    col += mix(tone, vec3(1.0), 0.4) * ridge * (0.25 + 0.5 * clamp(audioKick, 0.0, 1.0));
    finish(col);
}
