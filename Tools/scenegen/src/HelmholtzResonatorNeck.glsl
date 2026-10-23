//@doc
 * @brief HELMHOLTZ RESONATOR NECK: Helmholtz resonators: hollow spheres with a narrow neck that resonate at one frequency; the picture is a field of openings whose columns of air swing as whirling circles out of the photo.  Each opening belongs to one of three bands (low, mid, high) whose
 * strength activates it; an active opening whirls the photo behind it.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBass, audioMid, audioHigh -> the activation of the openings of each band (light and swirl strength)
 *   audioAdvance -> the whirls turn (integrated)
 *
 * Knobs: sizeP (the size of the openings), hueP.
//@params sizeP
//@audio audioBass audioMid audioHigh audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.1 + 0.08 * clamp(sizeP, 0.0, 1.0);
    vec2 g = p / S;
    vec2 ci = floor(g + 0.5);
    vec2 d = (g - ci) * S;
    float R = S * 0.42;
    float h = hash21(ci);
    float band = h < 0.33 ? audioBass : (h < 0.66 ? audioMid : audioHigh);
    float act = 0.3 + 0.7 * clamp(band, 0.0, 1.0);
    float r = length(d);
    float swirl = (2.5 + 4.0 * act) * pow(max(1.0 - r / R, 0.0), 2.0) * (h > 0.5 ? 1.0 : -1.0);
    float rot = swirl + 0.05 * audioAdvance + 0.04 * sceneTime * (h > 0.5 ? 1.0 : -1.0);
    vec2 q = ci * S + rot2(rot) * d * (0.9 + 0.2 * act);
    vec3 c = imgLod(q * 0.85 + 0.5, 0.6);
    float inside = 1.0 - smoothstep(R * 0.95, R, r);
    float rim = smoothstep(R * 0.95, R, r) * (1.0 - smoothstep(R * 1.12, R * 1.22, r));
    vec3 plate = imgLod(p * 0.85 + 0.5, 2.0) * 0.16 + vec3(0.04);
    vec3 col = plate + c * inside * (0.55 + 0.7 * act) + vec3(0.7, 0.55, 0.3) * rim * 0.45;
    finish(col * 1.15);
}
