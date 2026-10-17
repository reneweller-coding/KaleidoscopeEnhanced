//@doc
 * @brief ELASTIC TURBULENCE RIBBONS: a polymer solution at a tiny Reynolds number -- no inertia, yet the elastic
 * stresses drive a slow, smooth, unpredictable flow that stretches the fluid into long ribbons which wind round
 * each other and never repeat.  The photo is carried by this flow: it is drawn into silky ribbons, each lit along
 * its length.  An endless, periodic field.
 *
 * Audio Reactivity (structure, not only light):
 *   audioMelodyPitch -> the shear rate follows the melody's contour (high notes stretch faster)
 *   audioSwell      -> the flow's strength
 *   audioPhase      -> the flow pattern drifts (integrated)
 *   audioKick       -> the ribbons' sheen flashes (light)
 *
 * Knobs: scaleP (the flow's eddy size), stretchP (the base shear rate), freshP (how fast the photo returns), hueP.
//@params scaleP stretchP freshP
//@audio audioSwell audioKick audioMelodyPitch
//@state 384 216 120 32
//@body
/**  The slow flow: the curl of a smooth, periodic stream function that changes its shape over time.
 *
 * @param x  The point in cells. (in)
 *
 * @return
 *   The velocity in cells per unit time (amplitude about 1).
 **/
vec2 slowFlow(vec2 x)
{
    float n = 2.0 + floor(3.0 * clamp(scaleP, 0.0, 0.999));
    vec2 k = 6.2831853 * vec2(floor(n * stateRes.x / stateRes.y + 0.5), n) / stateRes;
    float t = 0.04 * sceneTime + 0.02 * audioPhase;
    // psi: a handful of periodic modes with slowly turning phases
    vec2 v = vec2(0.0);
    for (int i = 0; i < 4; ++i) {
        float fi = float(i);
        vec2 kk = k * vec2(1.0 + mod(fi, 2.0), 1.0 + floor(fi / 2.0));
        vec2 ph = vec2(sin(t * (0.7 + 0.3 * fi) + fi), cos(t * (0.5 + 0.2 * fi) + 2.0 * fi)) * 3.0;
        float a = 1.0 / (1.0 + fi);
        // psi_i = a sin(kx x + ph.x) sin(ky y + ph.y)
        v += a * vec2(sin(kk.x * x.x + ph.x) * kk.y * cos(kk.y * x.y + ph.y),
                      -kk.x * cos(kk.x * x.x + ph.x) * sin(kk.y * x.y + ph.y)) / length(k);
    }
    return v;
}

/**  One step of the photo carried by the slow flow for this cell (the state pass).
 *
 * @return
 *   The photo displacement (rg), 0, 1.
 **/
vec4 stateStep()
{
    if (stateFrame < 0.5) return vec4(0.0, 0.0, 0.0, 1.0);
    vec2 x = vec2(stCell()) + 0.5;
    float shear = (0.15 + 0.35 * clamp(stretchP, 0.0, 1.0)) * (0.5 + 0.7 * clamp(audioSwell, 0.0, 1.0))
                  * (0.7 + 0.6 * clamp(audioMelodyPitch, 0.0, 1.0));
    return stCarry(slowFlow(x) * shear * 0.15, 0.0005 + 0.003 * clamp(freshP, 0.0, 1.0));   // <= 0.35 cells a step
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    vec2 cc = stView(p, 1.0);
    vec2 uv = stUV(cc);
    float lod = stLod(cc, resolution.y / stateRes.y);
    vec3 photo = imgLod(uv * 0.85 + 0.08, lod);
    // the ribbons' sheen: lit where the map is stretched in one direction (the ribbon's length)
    vec2 d0 = stLin(cc).rg;
    vec2 ux = stLin(cc + vec2(1.0, 0.0)).rg - d0, uy = stLin(cc + vec2(0.0, 1.0)).rg - d0;
    float aniso = abs(length(ux) - length(uy)) / max(length(ux) + length(uy), 1e-5);
    vec3 tone = imgPalette(0.35 + 0.03 * audioPhase);
    vec3 col = photo * (0.85 + 0.3 * aniso) + mix(tone, vec3(1.0), 0.5) * aniso * smoothstep(1.0, 3.0, lod) * 0.2
               * (0.5 + clamp(audioKick, 0.0, 1.0));
    finish(col);
}
