//@doc
 * @brief KLEIN BOTTLE GLIDE FIELD: the photo in a fundamental domain of the Klein bottle: in one direction the copies glide-reflect, every second copy standing upside-down and shifted along; where the eye crosses a seam the
 * photo stands reversed, and the seams slide.  Across the other direction the copies repeat plainly.  The shift of the copies follows the phase of the music, the width of the domain slowly breathes with the swell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the glide of the copies (integrated)
 *   audioSwell      -> the width of the domains breathes
 *
 * Knobs: widthP (the width of a domain), hueP.
//@params widthP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float W = 0.45 + 0.5 * clamp(widthP, 0.0, 1.0) + 0.06 * clamp(audioSwell, 0.0, 1.0);
    float x = p.x / W;
    float i = floor(x);
    float fx = fract(x);
    float flip = mod(i, 2.0) < 0.5 ? 1.0 : -1.0;
    float glide = 0.25 * sin(0.12 * audioPhase + 0.02 * sceneTime) + 0.1 * i;
    vec2 uv = vec2((fx - 0.5) * W * 0.8 + 0.5, flip * p.y * 0.8 + 0.5 + flip * glide);
    vec3 c = imgLod(uv, 0.7);
    float seam = smoothstep(0.0, 0.012 / W, min(fx, 1.0 - fx));
    finish(c * (0.7 + 0.3 * seam) * 1.08);
}
