//@doc
 * @brief ABNEY SHIFT HUE DRIFT: the Abney effect: white light changes the hue of a saturated colour; the picture shows the photo whose hue shifts with the dilution, changing from saturated to pale.  The colours are diluted with white by a share that swells and fades, and the hue is turned by an amount that depends on the
 * hue and the dilution, the way the Abney effect turns blues towards purple and yellows towards green.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the dilution with white (the share of white light)
 *   audioAdvance -> the dilution breathes (integrated)
 *
 * Knobs: sizeP (the strength of the shift), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    vec3 c = imgLod(p * 0.85 + 0.5, 0.6);
    float mx = max(c.r, max(c.g, c.b));
    float mn = min(c.r, min(c.g, c.b));
    float d = mx - mn;
    float h = 0.0;
    if (d > 1e-4) {
        if (mx == c.r) h = mod((c.g - c.b) / d, 6.0);
        else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
        else h = (c.r - c.g) / d + 4.0;
    }
    h /= 6.0;
    float dil = clamp(0.1 + 0.6 * clamp(audioSwell, 0.0, 1.0) + 0.25 * sin(0.04 * audioAdvance + 0.05 * sceneTime), 0.0, 0.95);
    float sh = (0.12 + 0.2 * clamp(sizeP, 0.0, 1.0)) * dil * sin(6.2831853 * (h - 0.1));
    float s = d / max(mx, 1e-3);
    vec3 col = hsv2rgb(vec3(fract(h + sh), s * (1.0 - dil), mx));
    col = mix(col, vec3(luma(col)), 0.0) + vec3(dil * 0.18 * mx);
    finish(col * 1.1);
}
