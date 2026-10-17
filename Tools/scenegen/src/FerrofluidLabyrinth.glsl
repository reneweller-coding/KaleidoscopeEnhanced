//@doc
 * @brief FERROFLUID LABYRINTH: a ferrofluid in a thin gap under a perpendicular field -- the drop cannot stay round:
 * it fingers out into a labyrinth of black, glossy corridors that keeps rebuilding itself.  Tilt the field and the
 * corridors comb into stripes along it.  The fluid is a mirror: the photo is reflected in its curved surface, with
 * sharp highlights on every ridge.  An endless, periodic field.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBass       -> the field strength: deeper, narrower fingers
 *   audioHarmAdvance -> each change of harmony tilts the field a little further (the stripes swing round, gliding)
 *   audioOnset      -> a drop of fluid lands at a wandering place (new fingers grow from it)
 *   audioKick       -> the highlights flash (light)
 *
 * Knobs: tiltP (how strongly the tilt combs the corridors), widthP (corridor width), glossP (how mirror-like), hueP.
//@params tiltP widthP glossP
//@audio audioBass audioKick audioOnset audioHarmAdvance
//@state 320 180 600
//@body
/**  One explicit FitzHugh-Nagumo step for this cell with diffusion combed along the field's tilt (the state pass).
 *
 * @return
 *   u (fluid > 0), v, 0, 1.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    if (stateFrame < 0.5) {
        // a spray of droplets to start from: they finger out and join into the labyrinth within seconds
        return vec4(hash21(floor(vec2(ip) / 6.0) + 2.3) < 0.35 ? 1.0 : -1.0, 0.0, 0.0, 1.0);
    }
    vec4 c = stAt(ip);
    vec2 e = stAt(ip + ivec2(1, 0)).rg, w = stAt(ip - ivec2(1, 0)).rg;
    vec2 n = stAt(ip + ivec2(0, 1)).rg, s = stAt(ip - ivec2(0, 1)).rg;
    vec2 ne = stAt(ip + ivec2(1, 1)).rg, nw = stAt(ip + ivec2(-1, 1)).rg;
    vec2 se = stAt(ip + ivec2(1, -1)).rg, sw = stAt(ip - ivec2(1, 1)).rg;
    vec2 uxx = e + w - 2.0 * c.rg, uyy = n + s - 2.0 * c.rg, uxy = 0.25 * (ne - nw - se + sw);
    float ang = 0.35 * audioHarmAdvance + 0.01 * sceneTime;
    vec2 t = vec2(cos(ang), sin(ang));
    float an = 0.85 * clamp(tiltP, 0.0, 1.0);
    vec2 dtt = t.x * t.x * uxx + 2.0 * t.x * t.y * uxy + t.y * t.y * uyy;
    vec2 diff = (1.0 - 0.5 * an) * (uxx + uyy) + an * dtt;
    float sc = (0.6 + 0.8 * clamp(widthP, 0.0, 1.0)) * (1.2 - 0.5 * clamp(audioBass, 0.0, 1.0));
    float eps = 0.04, a1 = 2.0, a0 = -0.05, delta = 4.0, dt = 0.022;   // stable with the combed diffusion
    float u = c.r, v = c.g;
    float u2 = u + dt * (u - u * u * u - v + sc * diff.x);
    float v2 = v + dt * (eps * (u - a1 * v - a0) + delta * sc * diff.y);
    // an onset: a drop at a place drawn every 40 steps
    float slot = floor(stateFrame / 40.0);
    vec2 at = vec2(hash11(slot * 2.6 + 0.3), hash11(slot * 4.4 + 0.6)) * stateRes;
    vec2 d = vec2(ip) - at;
    d -= stateRes * floor(d / stateRes + 0.5);
    if (mod(stateFrame, 40.0) < 1.0 && clamp(audioOnset, 0.0, 1.0) > 0.6 && length(d) < 6.0) u2 = 1.0;
    return vec4(clamp(u2, -2.0, 2.0), clamp(v2, -2.0, 2.0), 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    vec2 cc = stView(p, 0.6);
    float u = stLin(cc).r;
    float hgt = smoothstep(-0.6, 0.6, u);
    vec2 g = vec2(smoothstep(-0.6, 0.6, stLin(cc + vec2(1.0, 0.0)).r) - smoothstep(-0.6, 0.6, stLin(cc - vec2(1.0, 0.0)).r),
                  smoothstep(-0.6, 0.6, stLin(cc + vec2(0.0, 1.0)).r) - smoothstep(-0.6, 0.6, stLin(cc - vec2(0.0, 1.0)).r));
    vec3 nrm = normalize(vec3(-g * 1.6, 1.0));
    // the fluid mirrors the photo: the reflected ray reads it a little way off
    vec3 refl = reflect(vec3(0.0, 0.0, -1.0), nrm);
    vec2 uv = p * 0.7 + 0.5 + 0.004 * sceneTime * vec2(1.0, 0.4);
    vec3 mirror = imgLod(uv + refl.xy * 0.15, 1.2);
    vec3 plate = imgLod(uv, 0.6);
    vec3 l = normalize(vec3(-0.4, 0.5, 0.8));
    float spec = pow(max(dot(reflect(-l, nrm), vec3(0.0, 0.0, 1.0)), 0.0), 40.0);
    float gloss = 0.4 + 0.5 * clamp(glossP, 0.0, 1.0);
    vec3 tone = imgPalette(0.3 + 0.03 * audioPhase);
    // a black mirror: the photo seen in it, brighter where the surface tilts toward the view's edge (Fresnel)
    float fres = 0.35 + 0.65 * pow(1.0 - nrm.z, 0.6);
    vec3 fluid = mirror * gloss * fres * 1.2 + vec3(0.015);
    vec3 col = mix(plate * 0.85, fluid, hgt);
    col += mix(tone, vec3(1.0), 0.6) * spec * hgt * (0.6 + 0.9 * clamp(audioKick, 0.0, 1.0));
    finish(col);
}
