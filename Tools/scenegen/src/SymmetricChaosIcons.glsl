//@doc
 * @brief SYMMETRIC CHAOS ICONS: the chaotic attractors with dihedral symmetry of Field and Golubitsky ("Symmetry in
 * Chaos"): a glowing icon of countless points -- veils, petals and filigree in perfect n-fold symmetry -- that the
 * view flies slowly into and out of, its shape reshaping with the chords and its symmetry changing with the sections.
 * The map is z' = (lambda + alpha |z|^2 + beta Re(z^n) + i omega) z + gamma conj(z)^(n-1); the density is gathered
 * over time in a field of the scene's own (every step adds a fresh stretch of the orbit and the old fades), and when a
 * section changes the old icon's orbit and the new one's are gathered side by side while one fades into the other.
 * The density is shown in shades of one colour family from the photo, the densest knots near white.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSectionId/Age -> every new section brings an icon of another symmetry (cross-faded over six seconds)
 *   audioHarmAdvance   -> the icon's parameters glide a little with the chords: it reshapes
 *   audioSwell         -> the glow
 *
 * Knobs: zoomP (how far the view flies in), glowP (how far the glow spreads), hueP.
//@params zoomP glowP
//@audio audioHarmAdvance audioSectionId audioSectionPrev audioSectionAge audioSwell
//@state 480 270 20
//@body
/**  An icon's parameters.
 *
 * @param k   Which icon (any whole number; the list repeats). (in)
 * @param p   lambda, alpha, beta, gamma. (out)
 * @param om  omega. (out)
 * @param n   The order of symmetry. (out)
 **/
void iconParams(float k, out vec4 p, out float om, out float n)
{
    float j = mod(k, 6.0);
    if (j < 0.5)      { p = vec4(-2.7, 5.0, 1.5, 1.0);     om = 0.0;  n = 6.0; }
    else if (j < 1.5) { p = vec4(-2.08, 1.0, -0.1, 0.167); om = 0.0;  n = 7.0; }
    else if (j < 2.5) { p = vec4(1.56, -1.0, 0.1, -0.82);  om = 0.12; n = 3.0; }
    else if (j < 3.5) { p = vec4(-1.806, 1.806, 0.0, 1.0); om = 0.0;  n = 5.0; }
    else if (j < 4.5) { p = vec4(-2.34, 2.0, 0.2, 0.1);    om = 0.0;  n = 5.0; }
    else              { p = vec4(2.6, -2.0, 0.0, -0.5);    om = 0.0;  n = 5.0; }
}

/**  A complex power by repeated multiplication.
 *
 * @param z  The number. (in)
 * @param n  The power (1..7). (in)
 *
 * @return
 *   z^n.
 **/
vec2 cpow(vec2 z, float n)
{
    vec2 r = z;
    for (int i = 1; i < 7; ++i) {
        if (float(i) >= n) break;
        r = vec2(r.x * z.x - r.y * z.y, r.x * z.y + r.y * z.x);
    }
    return r;
}

/**  One step of the icon's map.
 *
 * @param z   The point. (in)
 * @param p   lambda, alpha, beta, gamma. (in)
 * @param om  omega. (in)
 * @param n   The order. (in)
 *
 * @return
 *   The next point.
 **/
vec2 iconMap(vec2 z, vec4 p, float om, float n)
{
    vec2 zn = cpow(z, n);
    float f = p.x + p.y * dot(z, z) + p.z * zn.x;
    vec2 a = vec2(f * z.x - om * z.y, f * z.y + om * z.x);
    vec2 zc = cpow(vec2(z.x, -z.y), n - 1.0);
    return a + p.w * zc;
}

/**  The density of one icon's orbit near a place: a fresh stretch, gathered.
 *
 * @param x0   The place (in the icon's coordinates). (in)
 * @param k    Which icon. (in)
 * @param sig  The glow's width. (in)
 *
 * @return
 *   The gathered density.
 **/
float gatherIcon(vec2 x0, float k, float sig)
{
    vec4 p;
    float om, n;
    iconParams(k, p, om, n);
    p.x += 0.04 * sin(0.6 * max(audioHarmAdvance, 0.0));
    vec2 z = vec2(hash11(stateFrame * 0.731 + 0.1), hash11(stateFrame * 0.373 + 0.7)) * 0.6 - 0.3;
    for (int i = 0; i < 20; ++i) z = iconMap(z, p, om, n);
    float acc = 0.0;
    for (int i = 0; i < 1200; ++i) {
        z = iconMap(z, p, om, n);
        if (dot(z, z) > 100.0) z = vec2(0.11, 0.07);                  // (a stray orbit starts again)
        vec2 d = (z - x0) / sig;
        acc += exp(-dot(d, d));
    }
    return acc;
}

/**  The view's zoom: flying slowly in and out.
 *
 * @return
 *   The half height of the view in the icon's coordinates.
 **/
float viewHalf()
{
    return 1.15 / (1.0 + (0.4 + 1.2 * clamp(zoomP, 0.0, 1.0)) * (0.5 - 0.5 * cos(0.025 * sceneTime)));
}

/**  The state pass: the density, with a fresh stretch of the orbit(s) blended in.
 *
 * @return
 *   The density, 0, 0, 1.
 **/
vec4 stateStep()
{
    vec2 cell = vec2(stCell()) + 0.5;
    float vh = viewHalf();
    vec2 x0 = (cell / stateRes - 0.5) * vec2(1.7777778, 1.0) * 2.0 * vh;
    float sig = 2.0 * vh / stateRes.y * (0.8 + 1.5 * clamp(glowP, 0.0, 1.0));
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    float acc = 0.0;
    if (m < 0.999) acc += (1.0 - m) * gatherIcon(x0, max(audioSectionPrev, 0.0), sig);
    if (m > 0.001) acc += m * gatherIcon(x0, max(audioSectionId, 0.0), sig);
    float old = stateFrame < 0.5 ? acc : stAt(stCell()).r;
    return vec4(mix(old, acc, 0.06), 0.0, 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    vec2 cc = (p / vec2(1.7777778, 1.0) + 0.5) * stateRes;
    float dens = stLin(cc).r;
    float lit = 1.0 - exp(-dens * 1.6);
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = famCol(fh, 0.2 + 0.6 * lit) * lit * glow;
    col = mix(col, famLight(fh, 0.6, 0.9), smoothstep(0.75, 1.0, lit) * 0.6);
    col += famCol(fh, 0.45) * 0.015;
    finish(col);
}
