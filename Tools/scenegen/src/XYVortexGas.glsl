//@doc
 * @brief XY VORTEX GAS: the XY model -- a unit arrow in every cell, each turning toward its neighbours under thermal
 * noise (Langevin dynamics).  Vortices and antivortices appear in pairs; below the Kosterlitz-Thouless point they
 * find each other and annihilate, above it they unbind and roam as a gas.  Every arrow turns the photo locally:
 * each pixel reads the photo a little way off in the arrow's direction, so the picture swirls around every vortex,
 * once around clockwise or counter-clockwise.  Seen between crossed polarisers, every vortex sprouts four dark
 * brushes (a Schlieren texture).  An endless, periodic field.
 *
 * Audio Reactivity (structure, not only light):
 *   audioArousal    -> the temperature: excited music unbinds the vortex pairs (a busy gas), calm music lets
 *                      them annihilate (smooth, slow swirls)
 *   audioPhase      -> every arrow and the polarisers turn together (integrated): the brushes sweep
 *   audioOnset      -> a vortex pair set at a wandering place (structure)
 *   audioKick       -> the cores flash (light)
 *
 * Knobs: tempP (the base temperature around the KT point), swirlP (how far the photo is displaced), scaleP (cell
 * size), hueP.
//@params tempP swirlP scaleP
//@audio audioKick audioOnset audioArousal
//@state 320 180 120
//@body
/**  One Langevin step of the XY model for this cell (the state pass); the angle is kept as (cos, sin).
 *
 * @return
 *   cos theta, sin theta, vorticity glow, 1.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    if (stateFrame < 0.5) {
        float a = 6.2831853 * fbm(vec2(ip) * 0.05) * 2.0;
        return vec4(cos(a), sin(a), 0.0, 1.0);
    }
    vec4 c = stAt(ip);
    vec2 s = c.rg;
    vec2 sum = stAt(ip + ivec2(1, 0)).rg + stAt(ip - ivec2(1, 0)).rg + stAt(ip + ivec2(0, 1)).rg
               + stAt(ip - ivec2(0, 1)).rg;
    // torque: sum of sin(theta_j - theta_i) = cross(s, sum)
    float torque = s.x * sum.y - s.y * sum.x;
    float T = 0.89 * (0.8 + 0.5 * clamp(tempP, 0.0, 1.0) + 0.4 * (clamp(audioArousal, 0.0, 1.0) - 0.5));
    float dt = 0.1;
    // a Gaussian kick from two uniforms (Box-Muller)
    float gau = sqrt(-2.0 * log(max(stRand(0), 1e-6))) * cos(6.2831853 * stRand(1));
    float dth = dt * torque + sqrt(2.0 * T * dt) * gau;
    float a = atan(s.y, s.x) + dth;
    // an onset: a vortex-antivortex pair at a place drawn every 40 steps
    float slot = floor(stateFrame / 40.0);
    vec2 at = vec2(hash11(slot * 1.7 + 0.2), hash11(slot * 3.9 + 0.8)) * stateRes;
    vec2 d = vec2(ip) - at;
    d -= stateRes * floor(d / stateRes + 0.5);
    if (mod(stateFrame, 40.0) < 1.0 && clamp(audioOnset, 0.0, 1.0) > 0.6 && length(d) < 14.0)
        a = atan(d.y, d.x - 4.0) - atan(d.y, d.x + 4.0);
    // the plaquette's winding: where a vortex sits, the four angles around the corner add up to +-2 pi
    vec2 s1 = stAt(ip + ivec2(1, 0)).rg, s2 = stAt(ip + ivec2(1, 1)).rg, s3 = stAt(ip + ivec2(0, 1)).rg;
    float w = atan(s.x * s1.y - s.y * s1.x, dot(s, s1)) + atan(s1.x * s2.y - s1.y * s2.x, dot(s1, s2))
              + atan(s2.x * s3.y - s2.y * s3.x, dot(s2, s3)) + atan(s3.x * s.y - s3.y * s.x, dot(s3, s));
    float vort = abs(w) > 3.0 ? 1.0 : c.b * 0.9;
    return vec4(cos(a), sin(a), vort, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float zoom = 0.4 + 0.45 * clamp(scaleP, 0.0, 1.0);
    vec2 cc = stView(p, zoom);
    // five taps: the thermal jitter of single arrows averages out, the swirls stay
    vec4 s = 0.4 * stLin(cc) + 0.15 * (stLin(cc + vec2(1.5, 0.0)) + stLin(cc - vec2(1.5, 0.0)) + stLin(cc + vec2(0.0, 1.5))
                                      + stLin(cc - vec2(0.0, 1.5)));
    float a = atan(s.g, s.r) + 0.4 * audioPhase;
    float len = clamp(length(s.rg), 0.0, 1.0);
    // every arrow turns the photo: the pixel reads it a little way off in the arrow's direction
    float sw = 0.03 + 0.08 * clamp(swirlP, 0.0, 1.0);
    vec2 dir = vec2(cos(a), sin(a));
    vec2 uv = p * 0.7 + 0.5 + sw * dir + 0.005 * sceneTime * vec2(0.7, 1.0);
    // the photo smeared along the arrows (a short line integral): the field's swirls become visible as strokes
    vec3 photo = vec3(0.0);
    for (int i = -3; i <= 3; ++i) photo += imgLod(uv + dir * float(i) * 0.006, 0.6);
    photo /= 7.0;
    // between crossed polarisers (a Schlieren texture): bright where the arrows stand diagonal to the polarisers,
    // dark along them -- every vortex sprouts four dark brushes that turn with the polarisers
    float pol = 0.3 * audioPhase + 0.02 * sceneTime;
    float sch = pow(sin(2.0 * (atan(s.g, s.r) - pol)), 2.0);
    vec3 tone = imgPalette(a / 6.2831853 + 0.03 * audioPhase);
    vec3 col = mix(photo, photo * tone * 1.6, 0.3) * (0.1 + 1.25 * sch) * (0.4 + 0.6 * len);
    col += mix(tone, vec3(1.0), 0.5) * s.b * (0.5 + 0.8 * clamp(audioKick, 0.0, 1.0));
    finish(col);
}
