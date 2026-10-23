//@doc
 * @brief SUB BASS MEMBRANE: the photo as a membrane over which deep waves run from two centres outward and deform it: broad swells that lift and lower the picture, shaded by their slope so the surface can be seen; the amplitude
 * follows the sub-bass smoothed over a second, the phase of the waves runs on with it (both in a small field of the scene's own), so the membrane swells and the waves run faster as the bass deepens -- never shaking, always flowing.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSubBass    -> the amplitude and the running of the waves (smoothed, integrated)
 *   audioSwell      -> the shading's depth
 *
 * Knobs: waveP (how long the waves are), hueP.
//@params waveP
//@audio audioSubBass audioSwell
//@state 1 1 30 32
//@body
/**  The state pass: the smoothed sub-bass (x) and the wave clock that runs on with it (y).
 *
 * @return
 *   x the smoothed sub-bass, y the wave clock, 0, 1.
 **/
vec4 stateStep()
{
    vec4 old = stateFrame < 0.5 ? vec4(0.0) : texelFetch(texState, ivec2(0, 0), 0);
    float sm = old.x + (clamp(audioSubBass, 0.0, 1.0) - old.x) * 0.04;
    return vec4(sm, mod(old.y + (0.12 + 0.6 * sm) / 30.0, 1000.0), 0.0, 1.0);
}
void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    vec4 st = texelFetch(texState, ivec2(0, 0), 0);
    float K = 2.0 + 4.0 * (1.0 - clamp(waveP, 0.0, 1.0));
    float gr = 0.14 + 0.28 * clamp(st.x * 2.0, 0.0, 1.0) + 0.05 * clamp(audioSwell, 0.0, 1.0);
    float amp = gr / (6.2831853 * K);
    vec2 c1 = vec2(-0.2, 0.05), c2 = vec2(0.45, -0.12);
    vec2 d1 = p - c1, d2 = p - c2;
    float r1 = length(d1) + 0.001, r2 = length(d2) + 0.001;
    float ph1 = 6.2831853 * (r1 * K - st.y), ph2 = 6.2831853 * (r2 * K * 0.8 - st.y * 0.7 + 0.3);
    float h1 = sin(ph1) * exp(-1.1 * r1), h2 = sin(ph2) * exp(-1.1 * r2);
    float s1 = cos(ph1) * exp(-1.1 * r1), s2 = cos(ph2) * exp(-1.1 * r2);
    vec2 disp = amp * (d1 / r1 * h1 + d2 / r2 * h2);
    float slope = (s1 * 0.7 + s2 * 0.5) * gr;
    vec3 c = imgLod((p + disp) * 0.8 + 0.5, 0.6);
    float shade = 1.0 + (0.8 + 0.8 * clamp(audioSwell, 0.0, 1.0)) * slope + 0.25 * (h1 + h2) * gr;
    finish(c * clamp(shade, 0.5, 1.6) * 1.05);
}
