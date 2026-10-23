//@doc
 * @brief PHRASE CLOCK PHOTO SPIRAL: a spiral of thirty-two windings, one for each beat of the phrase: the winding that is counting is bright, the ones already counted keep a calmer light, the ones to come
 * wait dim, and every winding carries the photo at a scale and place of its own.  At the end of the phrase the lit windings fade as the count starts again, so the spiral closes round; the spiral rolls slowly with the drive of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos  -> the counting winding (32 beats a phrase)
 *   audioAdvance    -> the spiral rolls (integrated)
 *   audioSwell      -> the light of the counted windings
 *
 * Knobs: turnP (the width of the windings), hueP.
//@params turnP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float r = length(p), a = atan(p.y, p.x);
    float spin = 0.03 * audioAdvance + 0.005 * sceneTime;
    float K = 22.0 + 12.0 * (1.0 - clamp(turnP, 0.0, 1.0));
    float u = r * K - (a + 3.1415927) / 6.2831853 - spin * 6.2831853;
    float u0 = u + 32.0 * 4.0;
    float ph = rhyPhrase() * 32.0;
    float fu = fract(u);
    float body = smoothstep(0.0, 0.1, fu) * smoothstep(1.0, 0.9, fu);
    float head = rhyBump(u0, ph, 32.0, 1.8);
    float seen = smoothstep(ph + 0.6, ph - 0.6, mod(u0, 32.0)) * (1.0 - rhyBump(ph, 0.0, 32.0, 1.6));
    float sf = 0.5 + 0.5 * sin(0.35 * u);
    vec2 q = p * (0.5 + 0.8 * sf);
    vec2 uv = q * 0.8 + 0.5 + vec2(0.1 * sin(0.9 * u), 0.1 * cos(0.7 * u));
    vec3 c = imgLod(uv, 0.6 + 1.2 * sf);
    float lit = 0.32 + (0.3 + 0.35 * clamp(audioSwell, 0.0, 1.0)) * seen + 1.0 * head;
    finish(c * lit * (0.25 + 0.75 * body) * 1.15);
}
