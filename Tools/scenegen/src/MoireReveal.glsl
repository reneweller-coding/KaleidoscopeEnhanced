//@doc
 * @brief MOIRE REVEAL: the photo is hidden in the phase of a family of lines (the lines waver by the brightness) and a second,
 * wandering grating decodes it: the photo shows only in narrow strips that glide over the picture, each strip reading
 * one band of the brightness, under a fine line texture.  Elsewhere the lines stay a veil of the photo's own colours.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the decoding grating's angle (integrated)
 *   audioSwell      -> the strips' width (the decoder opens as the music swells)
 *   audioAdvance    -> the strips glide (integrated)
 *
 * Knobs: linesP (the lines' density), bandP (how much brightness range one strip reads), hueP.
//@params linesP bandP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = sceneTime * 0.4 + 3.0 * audioAdvance;
    float ang = 0.35 + 0.25 * sin(0.05 * (sceneTime + 6.0 * audioPhase));
    float across = dot(p, vec2(cos(ang), sin(ang)));
    vec3 c = imgLod(uv, 0.5);
    float L = luma(imgLod(uv, 2.0));
    float K = 1.5 + 2.5 * clamp(bandP, 0.0, 1.0);
    float width = 3.0 + 6.0 * (1.0 - clamp(audioSwell, 0.0, 1.0));
    float bump = pow(0.5 + 0.5 * cos(6.2831853 * (L * K - 0.08 * t - across * 1.3)), width);
    float lines = 0.72 + 0.28 * cos(6.2831853 * (40.0 + 50.0 * clamp(linesP, 0.0, 1.0)) * p.y + 8.0 * L);
    vec3 col = c * (0.2 + 1.05 * bump) * lines + imgLod(uv, 4.5) * 0.12;
    finish(col);
}
