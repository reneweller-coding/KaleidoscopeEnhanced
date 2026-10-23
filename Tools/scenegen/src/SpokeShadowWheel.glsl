//@doc
 * @brief SPOKE SHADOW WHEEL: the shadow of a spoked wheel: spokes, rim and hub run across the photo, and when the wheel speeds up it seems to turn backwards, as wagon wheels do in the cinema, because the spokes repeat; the rim is a
 * ring of soft shade, the spokes thin and soft, the hub a round shadow.  The turning follows the drive of the music.  Light warm, shade cool.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the turning of the wheel (integrated)
 *   audioSwell      -> the density of the shade
 *
 * Knobs: spokeP (the number of spokes), hueP.
//@params spokeP
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
    vec2 cen = vec2(0.15 * sin(0.015 * sceneTime), 0.02);
    vec2 d = p - cen;
    float r = length(d), a = atan(d.y, d.x);
    float N = 12.0 + 18.0 * clamp(spokeP, 0.0, 1.0);
    float w = 0.08 * audioAdvance + 0.15 * sceneTime;
    float R = 0.46;
    float s = (a - w) / 6.2831853 * N;
    float sp = smoothstep(0.1, 0.02, abs(fract(s) - 0.5 - 0.0) * 2.0 - 0.9 + 0.0);
    float spoke = smoothstep(0.07, 0.0, abs(fract(s + 0.5) - 0.5) * r * 6.2831853 / N - 0.006) * smoothstep(R + 0.01, R - 0.03, r) * smoothstep(0.05, 0.09, r);
    float rim = smoothstep(0.03, 0.0, abs(r - R) - 0.016);
    float rim2 = smoothstep(0.02, 0.0, abs(r - R * 0.72) - 0.006) * 0.6;
    float hub = smoothstep(0.075, 0.05, r);
    float sh = max(max(spoke, rim), max(rim2, hub));
    vec3 c = imgLod(p * 0.8 + 0.5, 0.7);
    finish(lightAndShade(c, sh, 0.5 + 0.5 * clamp(audioSwell, 0.0, 1.0)));
}
