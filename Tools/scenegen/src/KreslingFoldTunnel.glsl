//@doc
 * @brief KRESLING FOLD TUNNEL: the tunnel's wall is a Kresling fold -- a tube of backlit paper folded into rings of
 * twisted triangles -- and the flight runs through it while it turns; the folds deepen and flatten as waves of the
 * music run down the tube.  The wall is unrolled into panels around and rings along; each ring is turned half a panel
 * against the one before, so three families of creases cut it into triangles: the ring creases and two diagonals.  The
 * two kinds of triangle face the light differently -- the fold's depth is the contrast between them and the glow of
 * the creases; the depth follows the swell, and every onset sends a deeper fold from the far end toward the eye (the
 * scene keeps four seconds of onsets in a field of its own).  The paper shows the photo, calmed toward one colour
 * family.  Distinct from YoshimuraBuckling, which is flat.
 *
 * Audio Reactivity (structure, not only light):
 *   audioOnset   -> waves of deeper folds running down the tube toward the eye (kept for four seconds)
 *   audioSwell   -> how deep the paper is folded
 *   audioAdvance -> the flight (integrated)
 *   audioPhase   -> the tube's turning (integrated)
 *
 * Knobs: countP (panels around), foldP (the folds' depth), hueP.
//@params countP foldP
//@audio audioOnset audioSwell audioPhase
//@state 256 1 60
//@body
/**  The state pass: the onsets of the last four seconds, the newest in cell 0.
 *
 * @return
 *   x the onset, 0, 0, 1.
 **/
vec4 stateStep()
{
    ivec2 c = stCell();
    if (c.x == 0) return vec4(clamp(audioOnset, 0.0, 1.0), 0.0, 0.0, 1.0);
    if (stateFrame < 0.5) return vec4(0.0);
    return texelFetch(texState, ivec2(c.x - 1, 0), 0);
}

/**  The music's onset as it was a while ago.
 *
 * @param age  How long ago, in seconds. (in)
 *
 * @return
 *   The onset then (0 beyond four seconds).
 **/
float onsetAgo(float age)
{
    return stLin(vec2(clamp(age * 60.0 - stateFrac, 0.0, 254.0) + 0.5, 0.5)).r * (1.0 - smoothstep(3.6, 4.2, age));
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

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    const float R0 = 0.35, H = 0.6, ZF = 9.0, C = 4.0;
    float r = max(length(p), 1e-3), a = atan(p.y, p.x);
    float z = R0 / r;                                                 // the wall's depth here
    float fly = 0.3 * sceneTime + 1.1 * audioAdvance;
    float N = 2.0 * floor(4.0 + 3.0 * clamp(countP, 0.0, 1.0));      // even: the seam keeps the parity
    float s = (a + 0.02 * sceneTime + 0.15 * audioPhase) / 6.2831853 * N;
    float t = (z + fly) / H;
    float A = s - 0.5 * t, B = s + 0.5 * t;                           // the two diagonal creases
    // a pixel in lattice units
    float ds = N / (6.2831853 * r * resolution.y), dt = R0 / (r * r * H * resolution.y);
    float gD = length(vec2(ds, 0.5 * dt));
    float detail = 1.0 - smoothstep(0.12, 0.35, max(gD, dt));       // far off the lattice melts to its mean
    float facet = mod(floor(A) + floor(B) + floor(t), 2.0);           // the two kinds of triangle
    float fold = clamp((0.35 + 0.5 * clamp(foldP, 0.0, 1.0)) * (0.6 + 0.5 * clamp(audioSwell, 0.0, 1.0))
                       + 0.7 * onsetAgo(max(ZF - z, 0.0) / C), 0.0, 1.0);
    float shade = 0.6 + 0.4 * (2.0 * facet - 1.0) * fold * detail;
    float crease = exp(-pow((0.5 - abs(fract(A) - 0.5)) / (1.3 * gD), 2.0)) + exp(-pow((0.5 - abs(fract(B) - 0.5)) / (1.3 * gD), 2.0))
                 + exp(-pow((0.5 - abs(fract(t) - 0.5)) / (1.3 * dt), 2.0));
    vec2 puv = vec2(mod(floor(A), N) / N, fract(floor(t) * 0.137)) * 0.8 + 0.1 + vec2(fract(A), fract(t)) * 0.03;
    vec3 paper = tone(imgLod(puv, 3.0), fh);
    vec3 col = paper * (0.3 + 0.7 * shade) * 0.85;
    col += famLight(fh, 0.6, 0.5) * crease * (0.15 + 0.5 * fold) * detail * 0.5;
    // the far end: the tube's light dissolving into haze
    col = mix(col, famCol(fh, 0.5) * 0.4, smoothstep(4.0, 16.0, z));
    col += famLight(fh, 0.5, 0.7) * exp(-r * 9.0) * 0.5;
    finish(col);
}
