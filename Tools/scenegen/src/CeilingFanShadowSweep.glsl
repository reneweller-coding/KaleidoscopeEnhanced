//@doc
 * @brief CEILING FAN SHADOW SWEEP: the shadow of a ceiling fan turning over the photo: four broad blades that throw bands of shade, soft at the edges and softer the farther from the hub, so the light on the photo breathes with the
 * blades (only softly, with no flash); the hub is a round shadow with a soft rim.  The light is warm, the shade cool and clear.  The turning follows the bar of the music (a quarter turn each bar, which the four blades cannot tell from
 * none), the density of the shade the swell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBarPhase   -> the fan turns a quarter turn a bar (the blades' symmetry hides the end of the bar)
 *   audioSwell      -> the density of the shadow
 *
 * Knobs: bladeP (the width of the blades), hueP.
//@params bladeP
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
    vec2 cen = vec2(0.1 * sin(0.02 * sceneTime), 0.05);
    vec2 d = p - cen;
    float r = length(d), a = atan(d.y, d.x);
    float th = 1.5707963 * rhyBar() + 0.03 * audioAdvance;
    float w = 0.17 + 0.12 * clamp(bladeP, 0.0, 1.0);
    float ang = mod(a - th + 0.785398, 1.5707963) - 0.785398;
    float perp = abs(sin(ang)) * r;
    float along = cos(ang) * r;
    float soft = 0.02 + 0.09 * r;
    float blade = smoothstep(w * 0.5 + soft, w * 0.5 - soft, perp) * smoothstep(0.07, 0.1, along) * smoothstep(0.9, 0.7, along) * step(0.0, cos(ang));
    float hub = smoothstep(0.1, 0.06, r);
    float sh = max(blade, hub);
    vec3 c = imgLod(p * 0.8 + 0.5, 0.7);
    finish(lightAndShade(c, sh, 0.5 + 0.5 * clamp(audioSwell, 0.0, 1.0)));
}
