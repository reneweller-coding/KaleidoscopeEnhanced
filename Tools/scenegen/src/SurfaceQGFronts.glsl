//@doc
 * @brief SURFACE QG FRONTS: the look of surface quasi-geostrophic turbulence -- two water masses, warm and cold,
 * stirred by a field of eddies that grow, drift and die, so the boundary between them is drawn into razor-sharp
 * fronts and hair-thin filaments that roll up into spirals.  The two masses are two cuts of the photo; the front
 * between them is a bright seam.  An endless, periodic field.
 *
 * Audio Reactivity (structure, not only light):
 *   audioRolloff    -> the fronts' sharpness (bright music: knife edges, dark music: soft blends)
 *   audioPhase      -> the eddy field drifts (integrated)
 *   audioSwell      -> the eddies' strength
 *   audioKick       -> the fronts flash (light)
 *
 * Knobs: eddyP (eddy size), stirP (the base stirring), mixP (how fast the masses separate again), hueP.
//@params eddyP stirP mixP
//@audio audioSwell audioKick audioRolloff
//@state 384 216 120 32
//@body
/**  The eddy field's velocity: the curl of a drifting, slowly changing noise stream function, periodic on the field.
 *
 * @param x  The point in cells. (in)
 *
 * @return
 *   The velocity in cells per unit time.
 **/
vec2 eddies(vec2 x)
{
    float n = 4.0 + 4.0 * floor(clamp(eddyP, 0.0, 0.999) * 3.0);
    vec2 per = vec2(floor(n * stateRes.x / stateRes.y), n);     // whole noise cells across the field: periodic
    vec2 q = x / stateRes * per;
    float t = 0.05 * sceneTime + 0.03 * audioPhase;
    float e = 0.02;
    // psi from periodic value noise: two octaves, the second turned through time
    float p0 = 0.0, px = 0.0, py = 0.0;
    for (int o = 0; o < 2; ++o) {
        float f = o == 0 ? 1.0 : 2.0;
        vec2 pp = per * f;
        vec2 qo = q * f + vec2(t * (o == 0 ? 1.0 : -1.3), t * 0.7);
        for (int j = 0; j < 3; ++j) {
            vec2 qq = qo + (j == 1 ? vec2(e, 0.0) : (j == 2 ? vec2(0.0, e) : vec2(0.0)));
            vec2 i = floor(qq), fr = fract(qq);
            fr = fr * fr * (3.0 - 2.0 * fr);
            vec2 i0 = mod(i, pp), i1 = mod(i + 1.0, pp);
            float v = mix(mix(hash21(i0), hash21(vec2(i1.x, i0.y)), fr.x),
                          mix(hash21(vec2(i0.x, i1.y)), hash21(i1), fr.x), fr.y) / f;
            if (j == 0) p0 += v; else if (j == 1) px += v; else py += v;
        }
    }
    vec2 grad = vec2(px - p0, py - p0) / e * per / stateRes;   // d psi / d cell
    return vec2(grad.y, -grad.x);
}

/**  One step of the two water masses carried by the eddies for this cell (the state pass): the photo displacement
 * and the masses' marker travel together; the marker is pulled back toward the plain split slowly.
 *
 * @return
 *   The photo displacement (rg), the marker (b: -1 cold .. 1 warm), 1.
 **/
vec4 stateStep()
{
    vec2 x = vec2(stCell()) + 0.5;
    float plain = sin(6.2831853 * x.y / stateRes.y) + 0.5 * sin(6.2831853 * 2.0 * x.x / stateRes.x);
    if (stateFrame < 0.5) return vec4(0.0, 0.0, plain, 1.0);
    float k = (6.0 + 14.0 * clamp(stirP, 0.0, 1.0)) * (0.5 + clamp(audioSwell, 0.0, 1.0));   // at most ~0.6 cells a step
    vec4 c = stCarry(eddies(x) * k, 0.0006);
    c.b = mix(c.b, plain, 0.0004 + 0.002 * clamp(mixP, 0.0, 1.0));
    return c;
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    vec2 cc = stView(p, 1.0);
    vec4 s = stLin(cc);
    vec2 uv = stUV(cc);
    float lod = stLod(cc, resolution.y / stateRes.y);
    vec3 warm = imgLod(uv * 0.85 + 0.08, lod);
    vec3 cold = imgLod(vec2(1.0 - uv.y, uv.x) * 0.9 + 0.1, lod);
    float sharp = 0.02 + 0.4 * (1.0 - clamp(audioRolloff, 0.0, 1.0));
    float w = smoothstep(-sharp, sharp, s.b);
    vec3 tW = imgPalette(0.08 + 0.03 * audioPhase), tC = imgPalette(0.58 + 0.03 * audioPhase);
    vec3 col = mix(mix(cold, cold * tC * 1.7, 0.35) * 0.65, mix(warm, warm * tW * 1.6, 0.25) * 1.05, w);
    float front = exp(-s.b * s.b / (sharp * sharp * 0.5 + 1e-4));
    col += mix(mix(tW, tC, 0.5), vec3(1.0), 0.5) * front * (0.2 + 0.5 * clamp(audioKick, 0.0, 1.0));
    finish(col);
}
