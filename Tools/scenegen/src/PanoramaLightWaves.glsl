//@doc
 * @brief PANORAMA LIGHT WAVES: waves of light sweep across the whole picture from the side where the music sits in the
 * stereo image -- from the left when it leans left, from the right when it leans right, from both sides at once when
 * the mix is wide, crossing and overlapping in the middle; one wave front sets out per beat, so the wavelength follows
 * the tempo.  A small field of the scene's own counts the beats and follows the tempo; the fronts travel at a fixed
 * speed, a wavelength apart, and each side's strength is the balance and width of the stereo image.  The light is
 * shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioStereoL/R -> the stereo balance: which side the waves come from
 *   audioStereo    -> the stereo width: wide mixes send waves from both sides
 *   audioBeatPhase -> one front per beat (counted), the wavelength following the tempo (measured)
 *   audioSwell     -> the waves' glow
 *
 * Knobs: speedP (the waves' speed), fogP (how thick the haze is), hueP.
//@params speedP fogP
//@audio audioStereoL audioStereoR audioStereo audioBeatPhase audioSwell
//@state 1 1 60 32
//@body
/**  The state pass: the beats counted by summing the beat phase's steps, and the tempo followed.
 *
 * @return
 *   x the beats so far, y the last beat phase, z the beats a second (smoothed), 1.
 **/
vec4 stateStep()
{
    float bp = clamp(audioBeatPhase, 0.0, 1.0);
    if (stateFrame < 0.5) return vec4(0.0, bp, 2.0, 1.0);
    vec4 old = texelFetch(texState, ivec2(0, 0), 0);
    float d = fract(bp - old.y + 1.0);
    float rate = old.z;
    if (d > 0.5) d = 0.0;
    else if (d > 0.0) rate = mix(rate, clamp(60.0 * d, 0.6, 4.0), 0.02);
    return vec4(mod(old.x + d, 4096.0), bp, rate, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    float speed = 0.5 + 0.5 * clamp(speedP, 0.0, 1.0);
    vec4 st = texelFetch(texState, ivec2(0, 0), 0);
    float dl = fract(clamp(audioBeatPhase, 0.0, 1.0) - st.y + 1.0);
    float beats = st.x + (dl < 0.5 ? dl : 0.0);                       // the count carried on to this frame
    float lam = speed / st.z;                                         // one wavelength per beat
    float L = dot(audioStereoL, vec3(1.0)), R = dot(audioStereoR, vec3(1.0));
    float bal = (L - R) / max(L + R, 1e-3);
    float width = clamp(audioStereo, 0.0, 1.0);
    float aL = clamp(0.5 + 0.6 * bal + 0.5 * width, 0.0, 1.0), aR = clamp(0.5 - 0.6 * bal + 0.5 * width, 0.0, 1.0);
    float fog = 0.5 + 0.5 * fbm(2.0 * p + vec2(0.03 * sceneTime, 0.0)) * (0.6 + 0.8 * clamp(fogP, 0.0, 1.0));
    float bend = 0.08 * sin(2.0 * p.y + 0.15 * sceneTime);
    float phL = (p.x + 0.9 + bend) / lam - beats, phR = (0.9 - p.x + bend) / lam - beats;
    float wl = pow(0.5 + 0.5 * cos(6.2831853 * phL), 6.0) * exp(-0.6 * (p.x + 0.9)) * aL;
    float wr = pow(0.5 + 0.5 * cos(6.2831853 * phR), 6.0) * exp(-0.6 * (0.9 - p.x)) * aR;
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = famCol(fh, 0.45) * 0.03 * fog;
    col += (famLight(fh, 0.3, 0.4) * wl + famLight(fh, 0.7, 0.4) * wr) * fog * glow;
    finish(col);
}
