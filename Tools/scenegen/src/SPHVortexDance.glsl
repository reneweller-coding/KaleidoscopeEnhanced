//@doc
 * @brief SPH VORTEX DANCE: a whole frame of round drops swirling as one liquid -- no vessel, no splash, the flow
 * periodic in both directions.  Eight point vortices, half turning one way and half the other, dance round each
 * other by their own mutual induction (a state of eight cells, stepped on the state pass), and the drops ride the
 * flow they make: each drop is traced back along the stream to where it came from and wears the photo's colour from
 * there.  The drops stay round: their shape is measured in the frame, not where they came from; they fade in and
 * out over a few seconds, so the liquid renews itself.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the vortices' strengths swell and ebb (integrated)
 *   audioRoughness  -> the viscosity: rough sound widens the vortex cores
 *   audioKick       -> the drops flash (light)
 *
 * Knobs: dropP (the drops' density), speedP (the dance's pace), photoP (photo share), hueP.
//@params dropP speedP photoP
//@audio audioRoughness audioKick
//@state 8 1 60
//@body
const vec2 DOMW = vec2(1.7777778, 1.0);   // the periodic domain: the frame itself (16:9, height 1)

/**  The shortest periodic offset in the domain.
 *
 * @param d  The raw offset. (in)
 *
 * @return
 *   The offset wrapped into half a domain.
 **/
vec2 wrapD(vec2 d) { return d - DOMW * floor(d / DOMW + 0.5); }

/**  The velocity a set of point vortices induces at a point (Lamb-Oseen cores of radius a).
 *
 * @param x    The point. (in)
 * @param pos  The vortices' places. (in)
 * @param gam  Their strengths. (in)
 * @param a    The core radius. (in)
 *
 * @return
 *   The velocity.
 **/
vec2 vortexVel(vec2 x, vec2 pos[8], float gam[8], float a)
{
    vec2 u = vec2(0.0);
    for (int j = 0; j < 8; ++j) {
        vec2 d = wrapD(x - pos[j]);
        float r2 = dot(d, d);
        u += gam[j] * vec2(-d.y, d.x) / (r2 + a * a) * 0.1591549;
    }
    return u;
}

/**  The strength of vortex i: alternating signs, swelling with the music's phase.
 *
 * @param i  The vortex. (in)
 *
 * @return
 *   Its circulation.
 **/
float gammaOf(int i)
{
    float fi = float(i);
    return (mod(fi, 2.0) < 0.5 ? 1.0 : -1.0) * (0.12 + 0.07 * hash11(fi * 3.7)) * (1.0 + 0.4 * sin(0.03 * audioPhase + 1.7 * fi));
}

/**  The state pass: the vortices move with the velocity the others induce (their own core excluded).
 *
 * @return
 *   The vortex's place (xy), 0, 1.
 **/
vec4 stateStep()
{
    int i = int(gl_FragCoord.x);
    if (stateFrame < 0.5) return vec4((hash22(vec2(float(i), 7.3)) - 0.5) * DOMW, 0.0, 1.0);
    vec2 pos[8];
    float gam[8];
    for (int j = 0; j < 8; ++j) { pos[j] = texelFetch(texState, ivec2(j, 0), 0).xy; gam[j] = j == i ? 0.0 : gammaOf(j); }
    float a = 0.05 + 0.05 * clamp(audioRoughness, 0.0, 1.0);
    float dt = (0.6 + 1.2 * clamp(speedP, 0.0, 1.0)) / 60.0;
    vec2 x = pos[i] + vortexVel(pos[i], pos, gam, a) * dt;
    x = wrapD(x);
    return vec4(x, 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    vec2 pos[8];
    float gam[8];
    for (int j = 0; j < 8; ++j) { pos[j] = texelFetch(texState, ivec2(j, 0), 0).xy; gam[j] = gammaOf(j); }
    float a = 0.05 + 0.05 * clamp(audioRoughness, 0.0, 1.0);
    float spacing = 0.03 - 0.016 * clamp(dropP, 0.0, 1.0);
    float rad = spacing * 0.32;
    float life = 2.4, speedK = (0.6 + 1.2 * clamp(speedP, 0.0, 1.0));
    vec3 tone = imgPalette(0.35 + 0.03 * audioPhase);
    vec3 col = imgLod(p * 0.3 + 0.5, 5.0) * 0.12;
    for (int ph = 0; ph < 2; ++ph) {
        float f = fract(sceneTime / life + 0.5 * float(ph));
        float w = 1.0 - abs(2.0 * f - 1.0);
        float tau = f * life * speedK;
        // trace back along the stream (and two neighbours, for the shape's stretch)
        vec2 x0 = p, xa = p + vec2(0.004, 0.0), xb = p + vec2(0.0, 0.004);
        for (int s = 0; s < 6; ++s) {
            float h = tau / 6.0;
            x0 -= vortexVel(x0, pos, gam, a) * h;
            xa -= vortexVel(xa, pos, gam, a) * h;
            xb -= vortexVel(xb, pos, gam, a) * h;
        }
        mat2 J = mat2(xa - x0, xb - x0) / 0.004;                // d(origin) / d(here)
        // the drops: a jittered lattice where they came from; their distance measured back here
        vec2 g = x0 / spacing + float(ph) * 0.37;
        vec2 cell = floor(g);
        float best = 1e9;
        vec2 bestC = cell;
        for (int jj = -1; jj <= 1; ++jj) for (int ii = -1; ii <= 1; ++ii) {
            vec2 cc = cell + vec2(float(ii), float(jj));
            vec2 c = cc + 0.5 + 0.35 * (hash22(cc + float(ph) * 13.1) - 0.5);
            vec2 dOrigin = (g - c) * spacing;
            float det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
            mat2 Ji = mat2(J[1][1], -J[0][1], -J[1][0], J[0][0]) / (abs(det) > 1e-4 ? det : 1e-4);
            float d = length(Ji * dOrigin);
            if (d < best) { best = d; bestC = cc; }
        }
        float drop = smoothstep(rad, rad * 0.55, best);
        vec2 orig = (bestC + 0.5) * spacing - float(ph) * 0.37 * spacing;
        vec3 photo = imgLod(orig * 0.55 + 0.5, 1.0);
        vec3 c = mix(tone * 1.3, photo * 1.5, 0.5 + 0.45 * clamp(photoP, 0.0, 1.0));
        c *= 0.75 + 0.5 * smoothstep(rad, 0.0, best) + 0.4 * clamp(audioKick, 0.0, 1.0);
        col = mix(col, c, drop * w);
    }
    finish(col * 1.35);
}
