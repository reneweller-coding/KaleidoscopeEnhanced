//@doc
 * @brief FIBER END WALL TUNNEL: the tunnel's wall is made of thousands of glass fibre ends, each a round point of
 * light, and together they show the photo as a picture of dots; patterns of light run over them with the rhythm.  The
 * fibres sit on a staggered grid with a whole number around; each dot shows the photo at its place on the unrolled
 * wall, and every onset sends a band of brighter dots from the far end toward the eye, while a slow diagonal sweep
 * wanders over them (the scene keeps four seconds of onsets in a field of its own).  The dots are the photo's colours,
 * calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioOnset   -> bands of brighter dots running from the far end toward the eye (kept for four seconds)
 *   audioAdvance -> the flight (integrated)
 *   audioPhase   -> the diagonal sweep wanders (integrated)
 *   audioSwell   -> the dots' glow
 *
 * Knobs: dotP (how many fibres around), sweepP (how strong the sweep is), hueP.
//@params dotP sweepP
//@audio audioOnset audioPhase audioSwell
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
    const float R0 = 0.4, ZF = 10.0, C = 5.0;
    float r = max(length(p), 1e-3), a = atan(p.y, p.x);
    float z = R0 / r;
    float fly = 0.25 * sceneTime + 0.9 * audioAdvance;
    float M = floor(70.0 + 60.0 * clamp(dotP, 0.0, 1.0));            // fibres around
    float w = 6.2831853 * R0 / M;
    vec2 q = vec2(a / 6.2831853 * M, (z + fly) / (0.866 * w));
    float j = floor(q.y + 0.5);
    float off = 0.5 * mod(j, 2.0);
    float i = floor(q.x - off + 0.5);
    vec2 l = vec2(q.x - off - i, (q.y - j) * 0.866);
    float px = R0 / (r * r * resolution.y) / w;
    float detail = 1.0 - smoothstep(0.12, 0.35, px);
    float dotm = 1.0 - smoothstep(0.28 - px, 0.28 + px, length(l));
    // the picture: the photo unrolled over the wall, a picture every so many rows
    vec2 puv = vec2(mod(i, M) / M, fract(j * 0.866 * w / 3.0));
    vec3 photo = tone(imgLod(puv, 1.5), fh);
    float sweep = 0.5 + 0.5 * sin(6.2831853 * (mod(i, M) / M * 3.0 + j * 0.02) - 0.05 * sceneTime - 0.6 * audioPhase);
    float band = onsetAgo(max(ZF - z, 0.0) / C);
    float glow = (0.55 + 0.5 * clamp(audioSwell, 0.0, 1.0)) * (0.7 + (0.2 + 0.4 * clamp(sweepP, 0.0, 1.0)) * sweep) + 0.9 * band;
    vec3 dotc = photo * (0.4 + 1.1 * luma(photo)) * glow;
    vec3 col = mix(famCol(fh, 0.3) * 0.02, dotc, dotm);
    col += dotc * 0.15 * exp(-length(l) * 6.0);                        // each fibre's halo
    col = mix(photo * 0.35 * glow, col, detail);
    col = mix(col, famCol(fh, 0.5) * 0.3, smoothstep(6.0, 20.0, z));
    finish(famExpose(col, 1.58, 1.00, 0.00, fh));
}
