//@doc
 * @brief CHAOTIC QUILT PATTERNS: Field and Golubitsky's chaotic quilts: a chaotic map on a torus whose attractor has the
 * symmetry of a wallpaper -- a square tile of veils, knots and lace that repeats without seams over the whole picture
 * -- reshaping with the chords, its parameter set changing with the sections, the view drifting slowly over it.  The
 * map is x' = m x + lambda sin 2 pi x + alpha sin 2 pi x cos 2 pi y + beta sin 4 pi x + gamma sin 6 pi x cos 4 pi y
 * (and the same with x and y swapped), wrapped onto the unit square; its density is gathered over time in a field of
 * the scene's own, one torus tile, which the picture repeats.  The density is shown in shades of one colour family
 * from the photo, the densest lace near white.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSectionId/Age -> every new section brings another quilt (cross-faded over six seconds)
 *   audioHarmAdvance   -> the quilt's parameters glide a little with the chords: the lace reshapes
 *   audioAdvance       -> the view drifts over the quilt (integrated)
 *   audioSwell         -> the glow
 *
 * Knobs: tileP (the tiles' size on screen), glowP (how far the glow spreads), hueP.
//@params tileP glowP
//@audio audioHarmAdvance audioSectionId audioSectionPrev audioSectionAge audioSwell
//@state 256 256 20 32
//@body
/**  A quilt's parameters.
 *
 * @param k  Which quilt (any whole number; the list repeats). (in)
 * @param p  lambda, alpha, beta, gamma. (out)
 * @param m  The map's integer stretch. (out)
 **/
void quiltParams(float k, out vec4 p, out float m)
{
    float j = mod(k, 4.0);
    if (j < 0.5)      { p = vec4(-0.59, 0.2, 0.1, -0.33); m = 2.0; }
    else if (j < 1.5) { p = vec4(-0.2, -0.1, 0.1, -0.25); m = 0.0; }
    else if (j < 2.5) { p = vec4(0.25, -0.3, 0.2, 0.3);   m = 1.0; }
    else              { p = vec4(-0.253, 0.216, -0.274, 0.252); m = 1.0; }
}

/**  One step of the quilt's map, wrapped onto the unit square.
 *
 * @param z  The point. (in)
 * @param p  lambda, alpha, beta, gamma. (in)
 * @param m  The map's integer stretch. (in)
 *
 * @return
 *   The next point.
 **/
vec2 quiltMap(vec2 z, vec4 p, float m)
{
    const float TP = 6.2831853;
    vec2 s1 = sin(TP * z), c1 = cos(TP * z);
    vec2 s2 = sin(2.0 * TP * z), s3 = sin(3.0 * TP * z), c2 = cos(2.0 * TP * z);
    vec2 n = m * z + p.x * s1 + p.y * s1 * c1.yx + p.z * s2 + p.w * s3 * c2.yx;
    return fract(n);
}

/**  The density of one quilt's orbit near a place on the torus: a fresh stretch, gathered.
 *
 * @param x0   The place (in the unit square). (in)
 * @param k    Which quilt. (in)
 * @param sig  The glow's width. (in)
 *
 * @return
 *   The gathered density.
 **/
float gatherQuilt(vec2 x0, float k, float sig)
{
    vec4 p;
    float m;
    quiltParams(k, p, m);
    p.x += 0.03 * sin(0.6 * max(audioHarmAdvance, 0.0));
    vec2 z = vec2(hash11(stateFrame * 0.731 + 0.1), hash11(stateFrame * 0.373 + 0.7));
    for (int i = 0; i < 16; ++i) z = quiltMap(z, p, m);
    float acc = 0.0;
    for (int i = 0; i < 2000; ++i) {
        z = quiltMap(z, p, m);
        vec2 d = (fract(z - x0 + 0.5) - 0.5) / sig;                  // (the torus: the nearest copy)
        acc += exp(-dot(d, d));
    }
    return acc;
}

/**  The state pass: the density of one torus tile, with a fresh stretch of the orbit(s) blended in.
 *
 * @return
 *   The density, 0, 0, 1.
 **/
vec4 stateStep()
{
    vec2 x0 = (vec2(stCell()) + 0.5) / stateRes;
    float sig = (1.5 + 1.5 * clamp(glowP, 0.0, 1.0)) / stateRes.y;
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    float acc = 0.0;
    if (m < 0.999) acc += (1.0 - m) * gatherQuilt(x0, max(audioSectionPrev, 0.0), sig);
    if (m > 0.001) acc += m * gatherQuilt(x0, max(audioSectionId, 0.0), sig);
    float old = stateFrame < 0.5 ? acc / (2000.0 * 3.14159265 * sig * sig) : stAt(stCell()).r;
    return vec4(mix(old, acc / (2000.0 * 3.14159265 * sig * sig), 0.03), 0.0, 0.0, 1.0);   // the density relative to an even spread
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    float tile = 0.5 + 0.35 * clamp(tileP, 0.0, 1.0);
    vec2 drift = vec2(0.6, 0.25) * (0.005 * sceneTime + 0.02 * audioAdvance);
    vec2 uv = p / tile + drift;
    float dens = stLin(fract(uv) * stateRes).r;
    float lit = clamp((log(dens + 0.05) - log(0.3)) / (log(6.0) - log(0.3)), 0.0, 1.0);   // log: the lace shows over the haze
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = famCol(fh, 0.2 + 0.6 * lit) * lit * glow;
    col = mix(col, famLight(fh, 0.6, 0.9), smoothstep(0.75, 1.0, lit) * 0.6);
    col += famCol(fh, 0.45) * 0.015;
    finish(famExpose(col, 1.20, 1.00, 0.00, fh));
}
