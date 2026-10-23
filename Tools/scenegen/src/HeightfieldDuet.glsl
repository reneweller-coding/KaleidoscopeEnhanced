//@doc
 * @brief HEIGHTFIELD DUET: the second photo is a relief (brightness is height), the first lies over it as a skin of colour, and a raking light circles over the surface: the first photo lies like velvet on the relief of the second;
 * its colour shades by the slope, a faint gloss runs along the crests, and the skin slips a little down the slopes.  The light turns with the phase of the music, the height of the relief follows the swell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the light circles (integrated)
 *   audioSwell      -> the relief's height
 *
 * Knobs: reliefP (the base height), hueP.
//@params reliefP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float e = 0.004;
    vec2 g = vec2(luma(imgB(uv + vec2(e, 0.0), 1.8)) - luma(imgB(uv - vec2(e, 0.0), 1.8)),
                  luma(imgB(uv + vec2(0.0, e), 1.8)) - luma(imgB(uv - vec2(0.0, e), 1.8))) / (2.0 * e);
    float hgt = (0.5 + 1.5 * clamp(reliefP, 0.0, 1.0)) * (0.6 + 0.8 * clamp(audioSwell, 0.0, 1.0));
    vec3 n = normalize(vec3(-g * hgt * 0.35, 1.0));
    float t = 0.05 * sceneTime + 0.4 * audioPhase;
    vec3 L = normalize(vec3(cos(t) * 0.8, sin(t) * 0.8, 0.5));
    float lam = clamp(dot(n, L), 0.0, 1.0);
    float gloss = pow(clamp(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0, 1.0), 24.0);
    vec3 a = imgLod(uv - n.xy * 0.012, 0.6);
    finish(a * (0.3 + 1.0 * lam) + 0.25 * gloss * mix(a, vec3(1.0), 0.5));
}
