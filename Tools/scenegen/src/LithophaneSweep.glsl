//@doc
 * @brief LITHOPHANE SWEEP: a lithophane: the photo is the thickness of a white porcelain plate, lit from behind: where the plate is thick the light is held back and the picture dark, where thin it shines through; the light wanders
 * behind the plate, so that the thickness shades into a picture of warm and cool glowing, the slopes of the plate catching the light at the edges.  The plate takes a little of the photo's colour.  The light's place follows the phase
 * of the music, its colour temperature the spectral rolloff.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the light wanders behind the plate (integrated)
 *   audioRolloff    -> the colour temperature of the light (warm to cool)
 *
 * Knobs: thickP (the thickness of the plate), hueP.
//@params thickP
//@audio audioRolloff
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = 0.03 * sceneTime + 0.15 * audioPhase;
    vec2 Lp = vec2(0.6 * sin(t), 0.3 * sin(1.3 * t + 1.0));
    vec3 c = imgLod(uv, 1.0);
    float th = 1.0 - luma(imgLod(uv, 1.0));
    vec2 par = (p - Lp) * 0.08;
    float th2 = 1.0 - luma(imgLod(uv - par, 1.2));
    float k = 2.0 + 3.0 * clamp(thickP, 0.0, 1.0);
    float trans = exp(-k * th2);
    float scat = exp(-k * 0.5 * (1.0 - luma(imgLod(uv, 4.0))));
    float e = 0.004;
    vec2 g = vec2(luma(imgLod(uv + vec2(e, 0.0), 1.5)) - luma(imgLod(uv - vec2(e, 0.0), 1.5)),
                  luma(imgLod(uv + vec2(0.0, e), 1.5)) - luma(imgLod(uv - vec2(0.0, e), 1.5))) / (2.0 * e);
    float edge = clamp(dot(normalize(vec3(-g * 0.3, 1.0)), normalize(vec3(Lp - p, 0.8))), 0.0, 1.0);
    float rr = clamp(audioRolloff, 0.0, 1.0);
    vec3 tint = mix(vec3(1.0, 0.78, 0.5), vec3(0.72, 0.86, 1.0), rr);
    vec3 alb = mix(vec3(1.0), c / max(luma(c), 0.1), 0.25);
    vec3 col = tint * alb * (0.15 + 1.1 * trans + 0.3 * scat * trans + 0.25 * edge) * (1.0 - 0.15 * length(p - Lp));
    finish(col);
}
