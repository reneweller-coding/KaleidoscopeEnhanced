//@doc
 * @brief MACKEREL RIPPLE SKY: a mackerel sky: a sky of small regular ripples made by shear waves, with the interference of two systems; the photo sets the tones.  Two wave systems of nearly equal wavelength cross at an angle; where their crests meet, small clouds stand; the angle between them follows the key.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the angle between the two systems (integrated)
 *   audioAdvance     -> the ripples travel (integrated)
 *
 * Knobs: sizeP (the spacing of the ripples), hueP.
//@params sizeP
//@audio audioAdvance audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float k = 28.0 + 30.0 * (1.0 - clamp(sizeP, 0.0, 1.0));
    float ang = 0.3 + 0.9 * (0.5 + 0.5 * sin(0.04 * audioHarmAdvance + 0.015 * sceneTime));
    float t = 0.03 * audioAdvance + 0.05 * sceneTime;
    float w1 = cos(k * dot(p, vec2(cos(0.2), sin(0.2))) - t * 4.0);
    float w2 = cos(k * 1.03 * dot(p, vec2(cos(0.2 + ang), sin(0.2 + ang))) + t * 3.0);
    float s = 0.5 + 0.25 * w1 + 0.25 * w2 + 0.3 * (fbm(p * 3.0 + vec2(0.0, 0.01 * sceneTime)) - 0.5);
    float cl = smoothstep(0.5, 0.85, s);
    vec3 c = imgLod(p * 0.85 + 0.5, 1.0);
    vec3 sky = mix(vec3(0.3, 0.5, 0.85), c * 0.8, 0.35) * (0.8 + 0.3 * p.y + 0.15);
    vec3 cloud = mix(vec3(0.97, 0.97, 1.0), c * 1.25, 0.3) * (0.75 + 0.35 * s);
    finish(mix(sky, cloud, cl) * 1.08);
}
