//@doc
 * @brief TEXTURE LASER SCAN: lasers draw the photo's contours into fog: thin bright lines along the levels of its
 * brightness, drawn by a scanning head that sweeps round in time with the beat and leaves the lines fading behind it;
 * every new phrase draws other contours.  The contours are lines of equal brightness of the softened photo, their width
 * measured by the brightness's slope; the head sweeps a full turn in eight beats (counted in a small field of the
 * scene's own), and a line is as bright as it is fresh since the head passed; a fan of the laser's beam reaches from
 * the projector below to the head.  A phrase's contour levels are cross-faded at its start.  Shades of one colour
 * family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBeatPhase -> the scanning head sweeps round, a turn in eight beats (counted)
 *   audioPhrasePos -> every phrase draws other contours (cross-faded at the phrase's start)
 *   audioSwell     -> the lasers' brightness
 *
 * Knobs: levelP (how many contours), fadeP (how long the lines stay), hueP.
//@params levelP fadeP
//@audio audioBeatPhase audioPhrasePos audioSwell
//@state 1 1 60 32
//@body
/**  The state pass: the beats counted by summing the beat phase's steps, and the phrases counted.
 *
 * @return
 *   x the beats so far, y the last beat phase, z the phrases so far, w the last phrase position.
 **/
vec4 stateStep()
{
    float bp = clamp(audioBeatPhase, 0.0, 1.0), pp = clamp(audioPhrasePos, 0.0, 1.0);
    if (stateFrame < 0.5) return vec4(0.0, bp, 0.0, pp);
    vec4 old = texelFetch(texState, ivec2(0, 0), 0);
    float d = fract(bp - old.y + 1.0);
    if (d > 0.5) d = 0.0;
    float ph = old.z + (pp < old.w - 0.5 ? 1.0 : 0.0);
    return vec4(mod(old.x + d, 4096.0), bp, mod(ph, 4096.0), pp);
}

/**  The contour lines of a phrase at a place.
 *
 * @param l      The softened photo's brightness here. (in)
 * @param dl     Its change across a pixel. (in)
 * @param n      How many levels. (in)
 * @param phase  The phrase, which shifts the levels. (in)
 *
 * @return
 *   The lines' cover.
 **/
float contours(float l, float dl, float n, float phase)
{
    float v = l * n + fract(phase * 0.37);
    float e = 0.5 - abs(fract(v) - 0.5);
    return exp(-pow(e / max(1.2 * dl * n, 0.02), 2.0));
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    vec4 st = texelFetch(texState, ivec2(0, 0), 0);
    float dl0 = fract(clamp(audioBeatPhase, 0.0, 1.0) - st.y + 1.0);
    float beats = st.x + (dl0 < 0.5 ? dl0 : 0.0);                     // the count carried on to this frame
    vec2 uv = vec2(0.5) + p * vec2(0.55, 0.95);
    float l = luma(imgLod(uv, 3.0));
    float dl = length(vec2(dFdx(l), dFdy(l)));
    float n = 4.0 + 6.0 * clamp(levelP, 0.0, 1.0);
    float m = smoothstep(0.0, 0.08, clamp(audioPhrasePos, 0.0, 1.0));
    float lines = mix(contours(l, dl, n, st.z - 1.0), contours(l, dl, n, st.z), m);
    // how fresh: the head sweeps a turn in eight beats, the lines fade behind it
    float a = atan(p.y, p.x) / 6.2831853;
    float behind = fract(beats / 8.0 - a);
    float keep = 1.5 + 4.0 * clamp(fadeP, 0.0, 1.0);
    float fresh = exp(-behind * 8.0 / keep);
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 laser = famLight(fh, 0.4 + 0.3 * l, 0.45);
    vec3 col = famCol(fh, 0.4) * 0.025 + imgLod(uv, 5.0) * 0.03;
    col += laser * lines * (0.15 + 1.2 * fresh) * glow;
    // the beam fanning from the projector below to the head
    float ha = 6.2831853 * fract(beats / 8.0);
    vec2 head = 0.45 * vec2(cos(ha), sin(ha)), src = vec2(0.0, -0.62);
    vec2 sd = head - src, sp = p - src;
    float t = clamp(dot(sp, sd) / dot(sd, sd), 0.0, 1.0);
    float beam = exp(-pow(length(sp - sd * t) / 0.006, 2.0)) * t;
    col += laser * beam * 0.5 * glow + laser * exp(-length(p - head) / 0.02) * 0.6 * glow;
    finish(col);
}
