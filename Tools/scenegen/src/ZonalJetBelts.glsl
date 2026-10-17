//@doc
 * @brief ZONAL JET BELTS: beta-plane turbulence organises itself into alternating zonal jets -- an endless field of
 * belts like a gas giant's, but without a planet: eastward and westward streams with chains of vortices rolling
 * between them, the photo stretched along the jets and curled in the eddies.  An endless, periodic field.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSectionId  -> each section changes the number of jets (crossfaded over four seconds)
 *   audioSwell      -> how lively the vortex chains are
 *   audioAdvance    -> the vortices roll along (integrated)
 *   audioKick       -> the jets' edges flash (light)
 *
 * Knobs: jetsP (the base number of jets), eddyP (the eddies' strength), freshP (how fast the photo returns), hueP.
//@params jetsP eddyP freshP
//@audio audioSwell audioKick audioSectionId audioSectionAge
//@state 384 216 120 32
//@body
/**  The belts' velocity: zonal jets plus chains of vortices between them, drifting with the jets.
 *
 * @param x  The point in field units (the field is 1 high). (in)
 * @param n  The number of jet pairs. (in)
 *
 * @return
 *   The velocity in field units per unit time.
 **/
vec2 belts(vec2 x, float n)
{
    float k = 6.2831853 * n;
    vec2 v = vec2(cos(k * x.y), 0.0);                           // u = cos(k y): the jets
    // vortex chains on the jets' flanks: psi = A cos(k y) cos(m (x - c t))
    float m = 6.2831853 * 3.0 / 1.7777778 * 2.0;
    float A = (0.25 + 0.6 * clamp(eddyP, 0.0, 1.0)) * (0.6 + 0.8 * clamp(audioSwell, 0.0, 1.0));
    float drift = 0.02 * audioAdvance + 0.1 * sceneTime;
    float sx = sin(m * x.x - drift), cxx = cos(m * x.x - drift);
    v += A * vec2(-k * sin(k * x.y) * cxx, m * cos(k * x.y) * sx) / max(k, m) * 2.0;
    return v;
}

/**  One step of the photo carried by the belts for this cell (the state pass).
 *
 * @return
 *   The photo displacement (rg), 0, 1.
 **/
vec4 stateStep()
{
    if (stateFrame < 0.5) return vec4(0.0, 0.0, 0.0, 1.0);
    vec2 x = (vec2(stCell()) + 0.5) / stateRes.y;
    float s = floor(3.0 * clamp(jetsP, 0.0, 0.999)) + max(audioSectionId, 0.0);
    float nNow = 3.0 + mod(s, 3.0), nBefore = 3.0 + mod(s + 2.0, 3.0);
    float w = audioSectionId < 0.5 ? 1.0 : smoothstep(0.0, 4.0, audioSectionAge);
    float speed = 0.0012 * stateRes.y;
    return stCarry(mix(belts(x, nBefore), belts(x, nNow), w) * speed, 0.0006 + 0.003 * clamp(freshP, 0.0, 1.0));
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    vec2 cc = stView(p, 1.0);
    vec2 uv = stUV(cc);
    float lod = stLod(cc, resolution.y / stateRes.y);
    vec3 photo = imgLod(uv * 0.85 + 0.08, lod);
    float edge = smoothstep(1.0, 3.5, lod);
    vec3 tone = imgPalette(0.1 + 0.03 * audioPhase);
    vec3 col = photo * (0.9 + 0.2 * edge) + mix(tone, vec3(1.0), 0.5) * edge * 0.15 * (0.5 + clamp(audioKick, 0.0, 1.0));
    finish(col);
}
