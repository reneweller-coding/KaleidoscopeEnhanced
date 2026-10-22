//@doc
 * @brief ROTATING LOUVER TUNNEL: the tunnel's wall is a ring of louvres, slat after slat, turning in time with the beat
 * -- a wave of turning runs along the tunnel -- and wherever the slats open, stripes of light fall in from outside and
 * hang as shafts in the haze.  Every slat is a ring; it turns about its own length by the counted beats plus a step per
 * slat, so the opening runs along the tunnel as a wave; seen from inside, a slat covers a band as wide as its cosine
 * and the light shows through the rest.  The haze adds the same stripes seen nearer and softer, like shafts.  The light
 * outside is the photo, calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBeatPhase -> the slats turn with the beats (counted, so the turning runs on smoothly)
 *   audioAdvance   -> the flight (integrated)
 *   audioSwell     -> the light outside
 *
 * Knobs: slatP (the slats' spacing), hazeP (how thick the haze is), hueP.
//@params slatP hazeP
//@audio audioBeatPhase audioSwell
//@state 1 1 60 32
//@body
/**  The state pass: the beats counted by summing the beat phase's steps.
 *
 * @return
 *   x the beats so far, y the last beat phase, 0, 1.
 **/
vec4 stateStep()
{
    float bp = clamp(audioBeatPhase, 0.0, 1.0);
    if (stateFrame < 0.5) return vec4(0.0, bp, 0.0, 1.0);
    vec4 old = texelFetch(texState, ivec2(0, 0), 0);
    float d = fract(bp - old.y + 1.0);
    if (d > 0.5) d = 0.0;
    return vec4(mod(old.x + d, 4096.0), bp, 0.0, 1.0);
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

/**  How open the louvres are at a place along the tunnel.
 *
 * @param Y      The place along the tunnel. (in)
 * @param S      The slats' spacing. (in)
 * @param beats  The beats so far. (in)
 * @param px     A pixel in slats. (in)
 *
 * @return
 *   x the light through (0..1), y the slat's tilt (0 flat, 1 edge on).
 **/
vec2 louvre(float Y, float S, float beats, float px)
{
    float j = floor(Y / S), f = fract(Y / S) - 0.5;
    float th = 1.5707963 * beats + 0.35 * j;                          // a quarter turn a beat, a step per slat
    float cover = 0.5 * abs(cos(th)) + 0.04;                          // the slat's half width as seen
    float through = smoothstep(cover - px, cover + px, abs(f));
    return vec2(through, abs(sin(th)));
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
    vec4 st = texelFetch(texState, ivec2(0, 0), 0);
    float dl = fract(clamp(audioBeatPhase, 0.0, 1.0) - st.y + 1.0);
    float beats = st.x + (dl < 0.5 ? dl : 0.0);                       // the count carried on to this frame
    float S = 0.25 + 0.2 * clamp(slatP, 0.0, 1.0);
    float px = R0 / (r * r * resolution.y) / S;
    float detail = 1.0 - smoothstep(0.15, 0.4, px);
    vec3 outside = tone(imgLod(vec2(0.5 + 0.35 * cos(a), 0.5 + 0.35 * sin(a)), 3.0), fh)
                 * (0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    vec2 lv = louvre(z + fly, S, beats, px);
    float through = mix(0.35, lv.x, detail);
    vec3 slat = famCol(fh, 0.35) * (0.08 + 0.2 * (1.0 - lv.y)) + outside * 0.08;
    vec3 col = mix(slat, outside * 1.2, through);
    // the shafts: the same stripes nearer in the haze, soft and faint
    float haze = 0.15 + 0.25 * clamp(hazeP, 0.0, 1.0);
    for (int k = 1; k <= 3; ++k) {
        float zk = z * (1.0 - 0.22 * float(k));
        vec2 lk = louvre(zk + fly, S, beats, 0.5);
        col += outside * lk.x * haze * 0.25 * exp(-0.1 * zk);
    }
    col = mix(col, famCol(fh, 0.5) * 0.35, smoothstep(5.0, 18.0, z));
    col += outside * exp(-r * 9.0) * 0.3;
    finish(col);
}
