//@doc
 * @brief PILLOW EMBOSS BREATH: the photo as a padded surface whose height follows its softened brightness: a quilted cushion that breathes in and out, a raking light sweeping over it and picking out every swell with a soft
 * shine; the colour is the photo's, shaded by the slope.  The cushion's rise follows the swell of the music, the light's direction its phase.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the cushion's rise (breathing)
 *   audioPhase      -> the light sweeps round (integrated)
 *
 * Knobs: softP (how soft the cushion is), hueP.
//@params softP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float lod = 2.5 + 2.0 * clamp(softP, 0.0, 1.0);
    float e = 0.005 * (1.0 + 0.5 * lod);
    vec2 g = vec2(luma(imgLod(uv + vec2(e, 0.0), lod)) - luma(imgLod(uv - vec2(e, 0.0), lod)),
                  luma(imgLod(uv + vec2(0.0, e), lod)) - luma(imgLod(uv - vec2(0.0, e), lod))) / (2.0 * e);
    float breath = (0.7 + 0.5 * sin(0.4 * sceneTime)) * (0.5 + 0.9 * clamp(audioSwell, 0.0, 1.0));
    vec3 n = normalize(vec3(-g * 0.4 * breath, 1.0));
    float t = 0.05 * sceneTime + 0.3 * audioPhase;
    vec3 L = normalize(vec3(cos(t) * 0.8, sin(t) * 0.8, 0.45));
    float lam = clamp(dot(n, L), 0.0, 1.0);
    float spec = pow(clamp(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0, 1.0), 30.0);
    vec3 c = imgLod(uv, 0.7);
    finish(c * (0.35 + 0.9 * lam) + 0.3 * spec * mix(c, vec3(1.0), 0.5));
}
