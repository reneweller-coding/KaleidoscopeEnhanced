//@doc
 * @brief LACE CURTAIN BREEZE: the shadow of a lace curtain in the wind: tendrils and roses of light on the photo, the pattern breathing as the curtain fills and falls: the lace is made of small roses (rings of petals joined by
 * fine stalks and dotted ground), warped by a slow breeze so it sways and swells and the photo shows through its holes.  The breathing follows the swell of the music, the sway the drive; light warm, shade cool.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the breathing of the curtain (the lace swelling)
 *   audioAdvance    -> the breeze (integrated)
 *
 * Knobs: laceP (the size of the pattern), hueP.
//@params laceP
//@audio audioSwell
//@body
/**  The photo lit by a warm light and shaded by a soft shadow.
 *
 * @param c    The photo's colour. (in)
 * @param sh   The shadow, 0 lit .. 1 in shade. (in)
 * @param den  How dark the shade is, 0..1. (in)
 *
 * @return
 *   The colour.
 **/
vec3 lightAndShade(vec3 c, float sh, float den)
{
    vec3 lit = c * vec3(1.12, 1.03, 0.88) * 1.1;
    vec3 shade = c * vec3(0.55, 0.66, 0.82) * (1.0 - 0.6 * den);
    return mix(lit, shade, clamp(sh, 0.0, 1.0));
}
void main()
{
    vec2 p = screenP();
    float t = 0.1 * sceneTime + 0.08 * audioAdvance;
    float breath = 1.0 + 0.1 * clamp(audioSwell, 0.0, 1.0) * sin(0.7 * t * 3.0) + 0.04 * sin(0.4 * t);
    vec2 w = p + 0.045 * vec2(fbm(p * 2.0 + t) - 0.5, fbm(p * 2.0 + 5.0 - t * 0.8) - 0.5) * 2.0 + 0.03 * sin(2.0 * p.y + t) * vec2(1.0, 0.0);
    float s = (0.34 - 0.14 * clamp(laceP, 0.0, 1.0)) * breath;
    vec2 cell = floor(w / s + 0.5);
    vec2 f = (w / s - cell);
    float r = length(f), a = atan(f.y, f.x);
    float petal = 0.26 + 0.07 * cos(5.0 * a + 2.0 * hash21(cell));
    float rose = smoothstep(0.045, 0.0, abs(r - petal) - 0.02) + smoothstep(0.1, 0.06, r) * 0.9;
    float stalk = max(smoothstep(0.025, 0.0, abs(f.x) - 0.0) * smoothstep(0.5, 0.3, abs(f.y)) * smoothstep(0.3, 0.38, abs(f.y)),
                      smoothstep(0.025, 0.0, abs(f.y)) * smoothstep(0.5, 0.3, abs(f.x)) * smoothstep(0.3, 0.38, abs(f.x)));
    float dots = smoothstep(0.07, 0.04, length(fract(w / s * 3.0) - 0.5)) * 0.8 * smoothstep(0.5, 0.45, r * 0.0 + 0.5 - 0.0);
    float sh = clamp(max(rose, max(stalk, dots * 0.6)), 0.0, 1.0);
    vec3 c = imgLod(p * 0.8 + 0.5, 0.7);
    finish(lightAndShade(c, sh, 0.65));
}
