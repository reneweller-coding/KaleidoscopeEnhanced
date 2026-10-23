//@doc
 * @brief SHUTTER WAVE PHASE: venetian blinds before the photo: slats open and close in time with the bar, each one a little later than the one above it, so that a wave of opening runs down the picture
 * and the photo shines through the slits; the slats are dark metal that catches the light by their tilt.  The wave runs twice a bar.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBarPhase   -> the wave of opening runs twice through the bar
 *   audioSwell      -> how wide the slats open
 *   audioPhrasePos  -> the photo behind drifts slowly and closes after a phrase
 *
 * Knobs: slatP (the number of slats), hueP.
//@params slatP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float N = 14.0 + 14.0 * clamp(slatP, 0.0, 1.0);
    float bar = rhyBar(), ph = rhyPhrase();
    float yy = (0.5 - p.y) * N;
    float k = floor(yy);
    float f = fract(yy);
    float o = 0.5 + 0.5 * sin(6.2831853 * (2.0 * bar - k / N * 1.5));
    float open = clamp(o * (0.55 + 0.6 * clamp(audioSwell, 0.0, 1.0)) + 0.05, 0.04, 0.97);
    float hole = smoothstep(0.5 * open + 0.03, 0.5 * open - 0.01, abs(f - 0.5));
    vec2 uv = (p + vec2(0.25 * sin(6.2831853 * ph), 0.0)) * 0.8 + 0.5;
    vec3 c = imgLod(uv, 0.5);
    float tilt = (f - 0.5) * (1.0 - open);
    vec3 metal = vec3(0.06, 0.065, 0.075) + 0.3 * imgLod(uv, 5.0) * (0.35 + 0.65 * smoothstep(-0.3, 0.3, tilt));
    finish(mix(metal, c * 1.2, hole));
}
