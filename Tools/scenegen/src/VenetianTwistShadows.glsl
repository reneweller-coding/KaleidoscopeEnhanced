//@doc
 * @brief VENETIAN TWIST SHADOWS: a Venetian blind that turns and sweeps: bands of shade with soft edges that close and open, the width of the shadow and of the light between them set by the angle of the slats; the slats twist
 * along the blind, so that at the top of the picture the blind is open and at the bottom nearly closed, and the whole turns through the open and the closed as the music swells.  The bands lie at a slant that drifts with the phase,
 * the light is warm and the shade cool.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the angle of the slats (open to closed)
 *   audioPhase      -> the slant of the bands drifts (integrated)
 *
 * Knobs: slatP (the number of slats), hueP.
//@params slatP
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
    float ang = 0.35 + 0.1 * audioPhase * 0.2 + 0.1 * sin(0.04 * sceneTime);
    vec2 n = vec2(-sin(ang), cos(ang));
    float N = 8.0 + 12.0 * clamp(slatP, 0.0, 1.0);
    float u = dot(p, n) * N;
    float f = fract(u);
    float openAmt = 0.5 + 0.5 * cos(0.6 * clamp(audioSwell, 0.0, 1.0) * 0.0 + 1.6 * (1.0 - clamp(audioSwell, 0.0, 1.0)) + 1.2 * (0.5 - p.y));
    float soft = 0.06 + 0.1 * length(p);
    float sh = smoothstep(openAmt - soft, openAmt + soft, f) * smoothstep(1.0, 1.0 - soft, f) * 0.0 + smoothstep(openAmt - soft, openAmt + soft, f);
    vec3 c = imgLod(p * 0.8 + 0.5, 0.7);
    finish(lightAndShade(c, sh, 0.8));
}
