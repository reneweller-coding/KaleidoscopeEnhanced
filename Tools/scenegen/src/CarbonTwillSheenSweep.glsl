//@doc
 * @brief CARBON TWILL SHEEN SWEEP: carbon fibre in twill: two fibre directions that change in a twill and scatter the light in bands; the light wanders, and the bands run over the surface; the photo colours the resin above.  Every weave cell holds a bundle of fibres across or along (by the twill rule), an anisotropic
 * highlight runs along each bundle, and a clear coat tints with the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the light wanders (integrated)
 *   audioSpread  -> the weave width (smoothed)
 *
 * Knobs: sizeP (the weave width), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float W = (0.035 + 0.03 * clamp(sizeP, 0.0, 1.0)) * (1.0 + 0.2 * clamp(audioSpread, 0.0, 1.0));
    vec2 g = p / W;
    vec2 ci = floor(g);
    vec2 f = fract(g);
    float la = 0.03 * audioAdvance + 0.06 * sceneTime;
    vec3 L = normalize(vec3(0.7 * cos(la), 0.7 * sin(1.2 * la), 0.55));
    float tw = mod(ci.x - ci.y, 4.0) < 2.0 ? 1.0 : 0.0;
    vec3 T = tw > 0.5 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    float across = tw > 0.5 ? f.y : f.x;
    float along = tw > 0.5 ? f.x : f.y;
    float bump = sin(3.1415927 * across);
    vec3 N = normalize(tw > 0.5 ? vec3(0.0, (across - 0.5) * 1.4, 1.0) : vec3((across - 0.5) * 1.4, 0.0, 1.0));
    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
    float tl = dot(T, H);
    float spec = pow(max(sqrt(max(1.0 - tl * tl, 0.0)), 0.0), 18.0) * max(dot(N, H), 0.0);
    float ripple = 0.8 + 0.2 * sin(6.2831853 * along * 2.0 + 3.0 * across);
    vec3 c = imgLod(p * 0.85 + 0.5, 1.0);
    c = mix(vec3(luma(c)), c, 1.35);
    vec3 base = vec3(0.04, 0.04, 0.05) + 0.12 * c;
    vec3 col = base * (0.5 + 0.5 * bump) * ripple + spec * mix(vec3(1.0), c * 1.5, 0.6) * 0.9;
    float seam = smoothstep(0.0, 0.05, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    finish(col * (0.5 + 0.5 * seam) * 1.4);
}
