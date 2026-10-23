//@doc
 * @brief HOUNDSTOOTH SHEAR POINTS: houndstooth: the pattern of four points that is sheared into teeth when the warp is shifted; the photo colours the points light and dark, and the shear glides.  A check is overlaid by diagonal stripes of the same pitch, giving the toothed edge; the whole is sheared
 * sideways by a slow wave, and the photo tints the light and the dark part differently.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the shear
 *   audioAdvance -> the shear wave runs on (integrated)
 *
 * Knobs: sizeP (the size of the teeth), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.07 + 0.08 * clamp(sizeP, 0.0, 1.0);
    float shear = (0.1 + 0.5 * clamp(audioSwell, 0.0, 1.0)) * sin(0.05 * audioAdvance + 0.08 * sceneTime);
    vec2 q = vec2(p.x + shear * p.y, p.y) / S;
    vec2 ci = floor(q);
    vec2 f = fract(q);
    float chk = mod(ci.x + ci.y, 2.0);
    float diag = step(0.5, fract(0.5 * (q.x + q.y)));
    float d = abs(chk - diag);
    float tooth = f.x + f.y > 1.0 ? 1.0 : 0.0;
    float dark = abs(d - 0.0 * tooth);
    vec3 c = imgLod(p * 0.85 + 0.5, 0.8);
    vec3 cd = imgLod(p * 0.85 + 0.5 + 0.1, 1.5);
    vec3 light = mix(vec3(0.92), c, 0.35) * 1.05;
    vec3 darkc = mix(vec3(0.07), cd, 0.5) * 0.7;
    float edge = smoothstep(0.0, 0.03, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    vec3 col = mix(light, darkc, dark);
    finish(col * (0.88 + 0.12 * edge) * 1.1);
}
