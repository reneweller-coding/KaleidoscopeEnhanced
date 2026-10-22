//@doc
 * @brief GLOWING NET TUNNEL: a stretched net forms the tunnel, its knots glowing like beads; the net breathes with the
 * bass -- its strands swaying in slow waves -- and its mesh grows finer or coarser as the harmony moves.  The net is two
 * families of helical strands crossing at right angles, with a whole number of meshes around so it closes; the bass,
 * smoothed in a small field of the scene's own, sets the height of the waves that run along the strands, and the knots
 * sit where the strands cross.  The mesh count steps with the harmony's advance and is cross-faded as light.  The knots
 * take the photo's colours, calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBass        -> the net breathes: waves sway along its strands (smoothed)
 *   audioHarmAdvance -> the mesh: a chord change makes it finer or coarser (cross-faded)
 *   audioAdvance     -> the flight (integrated)
 *   audioSwell       -> the knots' glow
 *
 * Knobs: meshP (how fine the mesh is), knotP (how big the knots are), hueP.
//@params meshP knotP
//@audio audioBass audioHarmAdvance audioSwell
//@state 1 1 60
//@body
/**  The state pass: the bass smoothed.
 *
 * @return
 *   x the smoothed bass, 0, 0, 1.
 **/
vec4 stateStep()
{
    float b = clamp(audioBass, 0.0, 1.0);
    float old = stateFrame < 0.5 ? b : texelFetch(texState, ivec2(0, 0), 0).r;
    return vec4(mix(old, b, 0.05), 0.0, 0.0, 1.0);
}

/**  The photo's colour calmed toward the colour family.
 *
 * @param photo  The photo's colour. (in)
 * @param fh     The family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 tone(vec3 photo, float fh)
{
    float l = luma(photo);
    return mix(photo * 1.1, famCol(fh, 0.15 + 0.7 * l) * (0.25 + 1.2 * l), 0.45);
}

/**  The net at a place on the unrolled wall.
 *
 * @param X     Around the wall (arc length). (in)
 * @param Y     Along the wall. (in)
 * @param M     The meshes around. (in)
 * @param sway  The waves' height (in meshes). (in)
 * @param dX    A pixel's length around. (in)
 * @param dY    A pixel's length along. (in)
 * @param ks    The knots' size. (in)
 * @param fh    The family's hue. (in)
 *
 * @return
 *   The net's light here.
 **/
vec3 net(float X, float Y, float M, float sway, float dX, float dY, float ks, float fh)
{
    const float R0 = 0.4;
    float L = 6.2831853 * R0 / M;
    float run = 0.4 * sceneTime;
    float c1 = (X + Y) / L, c2 = (X - Y) / L;
    c1 += sway * sin(6.2831853 * c2 / 3.0 + run);                    // the waves along the strands
    c2 += sway * sin(6.2831853 * c1 / 3.0 - run);
    float g = length(vec2(dX, dY)) / L;
    float e1 = 0.5 - abs(fract(c1) - 0.5), e2 = 0.5 - abs(fract(c2) - 0.5);
    float strand = exp(-pow(e1 / (1.2 * g + 0.02), 2.0)) + exp(-pow(e2 / (1.2 * g + 0.02), 2.0));
    vec2 kid = floor(vec2(c1, c2) + 0.5);
    float knot = exp(-dot(vec2(e1, e2), vec2(e1, e2)) / pow(ks + g, 2.0));
    vec2 kn = vec2(mod(kid.x, M), kid.x - kid.y);                      // the knot, the same on both sides of the seam
    vec3 kc = tone(imgLod(fract(kn * vec2(1.0 / M, 0.113)) * 0.8 + 0.1, 3.0), fh);
    float detail = 1.0 - smoothstep(0.1, 0.3, g);
    return mix(famLight(fh, 0.5, 0.4) * 0.15, famLight(fh, 0.4, 0.4) * strand * 0.35 + kc * knot * 1.4, detail);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    const float R0 = 0.4;
    float r = max(length(p), 1e-3), a = atan(p.y, p.x);
    float z = R0 / r;
    float fly = 0.25 * sceneTime + 0.9 * audioAdvance;
    float X = (a + 0.01 * sceneTime) * R0, Y = z + fly;
    float dX = R0 / (r * resolution.y), dY = R0 / (r * r * resolution.y);
    float bass = texelFetch(texState, ivec2(0, 0), 0).r;
    float sway = 0.04 + 0.16 * bass;
    float ks = 0.06 + 0.06 * clamp(knotP, 0.0, 1.0);
    float h = max(audioHarmAdvance, 0.0), hk = floor(h), m = smoothstep(0.3, 0.7, fract(h));
    float base = 10.0 + 4.0 * floor(1.99 * clamp(meshP, 0.0, 1.0));
    vec3 nA = net(X, Y, base + 2.0 * mod(hk, 3.0), sway, dX, dY, ks, fh);
    vec3 nB = net(X, Y, base + 2.0 * mod(hk + 1.0, 3.0), sway, dX, dY, ks, fh);
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = famCol(fh, 0.45) * 0.03 + mix(nA, nB, m) * glow;
    col = mix(col, famCol(fh, 0.5) * 0.25, smoothstep(5.0, 18.0, z));
    col += famLight(fh, 0.5, 0.7) * exp(-r * 10.0) * 0.35;
    finish(col);
}
