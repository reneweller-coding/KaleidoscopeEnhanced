//@doc
 * @brief STRAIN LIT PARTICLES: a sea of tiny particles that light up where the water shears them, like bioluminescent
 * plankton in an eddy field: the stirring vortices themselves stay dark, but round their cores and between
 * neighbouring vortices, where the flow pulls the water apart, the particles glow.  The flow is a set of point
 * vortices with soft cores (Lamb-Oseen); its strain rate at each particle -- the size of the velocity gradient's
 * symmetric part, from the stream function's second derivatives -- is the particle's light.  The particles sit on a
 * jittered grid and drift a little with the flow.  Their light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance   -> the vortices wander (integrated) and the particles drift
 *   audioOnset     -> the vortices' strength surges (the glow flares where they shear)
 *   audioRoughness -> the cores' size (the water's viscosity): rough sound, tighter vortices
 *
 * Knobs: vortexP (how many vortices), grainP (the particles' density), hueP.
//@params vortexP grainP
//@audio audioOnset audioRoughness
//@body
/**  The strain rate of the vortex field at a point.
 *
 * @param x      The point. (in)
 * @param n      How many vortices. (in)
 * @param t      The vortices' wander. (in)
 * @param core   The cores' radius. (in)
 * @param gain   The vortices' strength. (in)
 * @param vel    Returns the velocity there. (out)
 *
 * @return
 *   The strain rate.
 **/
float strain(vec2 x, float n, float t, float core, float gain, out vec2 vel)
{
    float sxx = 0.0, sxy = 0.0;
    vel = vec2(0.0);
    for (int k = 0; k < 8; ++k) {
        float fk = float(k);
        if (fk >= n) break;
        vec2 c = vec2(0.8 * sin(t * (0.3 + 0.07 * fk) + 2.1 * fk), 0.45 * cos(t * (0.25 + 0.05 * fk) + 1.3 * fk));
        float G = gain * (mod(fk, 2.0) > 0.5 ? -1.0 : 1.0) * (0.6 + 0.4 * fract(fk * 0.618));
        vec2 d = x - c;
        float r2 = dot(d, d) + 1e-5;
        float e = 1.0 - exp(-r2 / (core * core));
        // the velocity of a Lamb-Oseen vortex: G / (2 pi r) (1 - e^(-r^2/a^2)), round the centre
        vel += G / 6.2831853 * e / r2 * vec2(-d.y, d.x);
        // its strain: grows like G / r^2 outside the core, vanishes at the centre
        float s = G / 6.2831853 * (2.0 * e / r2 - 2.0 * exp(-r2 / (core * core)) / (core * core)) / r2;
        sxx += s * d.x * d.y;
        sxy += s * 0.5 * (d.y * d.y - d.x * d.x);
    }
    return sqrt(sxx * sxx + sxy * sxy);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float n = floor(4.0 + 4.0 * clamp(vortexP, 0.0, 1.0));
    float S = 0.03 - 0.012 * clamp(grainP, 0.0, 1.0);
    float t = 0.05 * sceneTime + 0.2 * audioAdvance;
    float core = 0.05 + 0.08 * (1.0 - clamp(audioRoughness, 0.0, 1.0));
    float gain = 0.12 * (1.0 + 1.2 * clamp(audioOnset, 0.0, 1.0));
    vec3 col = famCol(fh, 0.45) * 0.012;
    vec2 g0 = floor(p / S);
    for (int k = 0; k < 9; ++k) {
        vec2 cid = g0 + vec2(float(k % 3) - 1.0, float(k / 3) - 1.0);
        float hc = fract(sin(dot(cid, vec2(12.9898, 78.233))) * 43758.5453);
        vec2 base = (cid + vec2(fract(hc * 7.3), fract(hc * 3.1))) * S;
        vec2 vel;
        float s = strain(base, n, t, core, gain, vel);
        vec2 at = base + vel * 0.15;                            // a little drift with the flow
        float d = length(p - at);
        float size = 0.0035 + 0.002 * fract(hc * 5.7);
        float lit = smoothstep(0.1, 1.2, s * 3.0);
        col += famLight(fh, 0.3 + 0.4 * hc, 0.5 * lit) * (smoothstep(size, size * 0.5, d) + 0.2 * exp(-d / (size * 2.0))) * (0.06 + 2.2 * lit);
    }
    finish(col);
}
