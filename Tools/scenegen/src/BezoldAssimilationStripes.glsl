//@doc
 * @brief BEZOLD ASSIMILATION STRIPES: the Bezold effect: fine lines of one colour make the surface look as if it were in that colour; the photo is covered with fine lines that reverse the impression.  Stripes of the photo's own saturated colour or of white lie over the picture; their width follows the music's
 * spread, and the colour of the stripes alternates between bands of the picture.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread  -> the width of the lines (smoothed)
 *   audioAdvance -> the lines run and turn (integrated)
 *
 * Knobs: sizeP (the number of lines), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    vec3 c = imgLod(p * 0.85 + 0.5, 0.8);
    float ang = 0.4 + 0.01 * audioAdvance + 0.015 * sceneTime;
    float N = 40.0 + 70.0 * clamp(sizeP, 0.0, 1.0);
    float s = dot(p, vec2(cos(ang), sin(ang))) * N;
    float wd = 0.15 + 0.25 * clamp(audioSpread, 0.0, 1.0);
    float st = 1.0 - smoothstep(wd, wd + 0.1, abs(fract(s) - 0.5) * 2.0);
    float band = floor(dot(p, vec2(-sin(ang), cos(ang))) * 4.0 + 0.5 * sin(0.05 * sceneTime));
    float kind = mod(band, 3.0);
    vec3 sat = c / max(max(c.r, max(c.g, c.b)), 0.05);
    vec3 hi = mix(vec3(luma(sat)), sat, 1.8);
    vec3 stripe = kind < 0.5 ? vec3(1.0) : (kind < 1.5 ? clamp(hi, 0.0, 1.0) : vec3(0.05, 0.06, 0.1));
    vec3 col = mix(c, stripe * (0.6 + 0.5 * luma(c)), st * 0.8);
    finish(col * 1.1);
}
