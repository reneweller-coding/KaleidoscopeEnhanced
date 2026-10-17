//@doc
 * @brief KOLMOGOROV MEANDERS: Kolmogorov flow -- bands of fluid driven back and forth by a sinusoidal force -- past
 * its instability: the shear bands meander, the meanders travel and pinch off into eddies, and the photo carried in
 * the bands is braided into interlocking ribbons.  An endless, periodic field.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBass       -> the driving amplitude (the bands' speed)
 *   audioSectionId  -> each section changes the number of bands (the velocity fields crossfade)
 *   audioAdvance    -> the meanders travel (integrated)
 *   audioKick       -> the shear lines flash (light)
 *
 * Knobs: bandsP (the first band count), meanderP (how far the bands meander), freshP (how fast the photo returns),
 * hueP.
//@params bandsP meanderP freshP
//@audio audioBass audioKick audioSectionId audioSectionAge
//@state 384 216 120 32
//@body
/**  The meandering jets' velocity: the stream function cos(k y + B sin(k2 x - w t)) for n bands across the field.
 *
 * @param x  The point in field units (the field is 1 high). (in)
 * @param n  The number of band pairs. (in)
 *
 * @return
 *   The velocity in field units per unit time.
 **/
vec2 jets(vec2 x, float n)
{
    float k = 6.2831853 * n, k2 = 6.2831853 * 2.0 / 1.7777778;
    float B = 0.4 + 1.2 * clamp(meanderP, 0.0, 1.0);
    float ph = 0.04 * audioAdvance + 0.15 * sceneTime;
    float arg = k * x.y + B * sin(k2 * x.x - ph) + 0.4 * sin(2.0 * k2 * x.x + 0.7 * ph);
    float darg_dx = B * k2 * cos(k2 * x.x - ph) + 0.8 * k2 * cos(2.0 * k2 * x.x + 0.7 * ph);
    // psi = cos(arg) / k: u = d psi / dy, v = -d psi / dx
    return vec2(-sin(arg), sin(arg) * darg_dx / k);
}

/**  One step of the photo carried by the meandering bands for this cell (the state pass).
 *
 * @return
 *   The photo displacement (rg), 0, 1.
 **/
vec4 stateStep()
{
    if (stateFrame < 0.5) return vec4(0.0, 0.0, 0.0, 1.0);
    vec2 x = (vec2(stCell()) + 0.5) / stateRes.y;
    float s = floor(clamp(bandsP, 0.0, 0.999) * 3.0) + max(audioSectionId, 0.0);
    float nNow = 2.0 + mod(s, 3.0), nBefore = 2.0 + mod(s + 2.0, 3.0);
    float m = audioSectionId < 0.5 ? 1.0 : smoothstep(0.0, 4.0, audioSectionAge);
    vec2 v = mix(jets(x, nBefore), jets(x, nNow), m);
    float speed = (0.0006 + 0.0014 * clamp(audioBass, 0.0, 1.0)) * stateRes.y;
    return stCarry(v * speed, 0.0005 + 0.003 * clamp(freshP, 0.0, 1.0));
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    vec2 cc = stView(p, 1.0);
    vec2 uv = stUV(cc);
    float lod = stLod(cc, resolution.y / stateRes.y);
    vec3 photo = imgLod(uv * 0.85 + 0.08, lod);
    float shear = smoothstep(1.0, 3.5, lod);
    vec3 tone = imgPalette(0.15 + 0.03 * audioPhase);
    vec3 col = photo * (0.9 + 0.2 * shear) + mix(tone, vec3(1.0), 0.5) * shear * 0.15 * (0.5 + clamp(audioKick, 0.0, 1.0));
    finish(col);
}
