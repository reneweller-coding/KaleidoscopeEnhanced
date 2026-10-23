//@doc
 * @brief WASHI FIBRE BACKLIT GLOW: Japanese paper against the light: long fibres in a translucent sheet with the photo as light behind it; the density of the fibres changes from patch to patch.  The sheet's transmission is a field of long curved fibres (stretched noise in two directions) and clouds; the photo behind
 * shines through, warm and soft, darker where the fibres lie thick.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the brightness of the light behind
 *   audioAdvance -> the clouds of density drift (integrated)
 *
 * Knobs: sizeP (the length of the fibres), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float t = 0.01 * audioAdvance + 0.015 * sceneTime;
    float fl = 8.0 + 18.0 * (1.0 - clamp(sizeP, 0.0, 1.0));
    float a1 = 0.5 + 0.6 * fbm(p * 1.5 + vec2(t, 0.0));
    vec2 r1 = rot2(a1) * p;
    float f1 = noise2(vec2(r1.x * fl * 0.35, r1.y * 160.0));
    float a2 = 2.3 + 0.7 * fbm(p * 1.3 + vec2(3.0, -t));
    vec2 r2 = rot2(a2) * p;
    float f2 = noise2(vec2(r2.x * fl * 0.3, r2.y * 220.0 + 7.0));
    float cloud = fbm(p * 2.2 + vec2(0.0, t * 1.5));
    float dens = 0.35 * smoothstep(0.55, 0.8, f1) + 0.3 * smoothstep(0.6, 0.85, f2) + 0.55 * cloud;
    float trans = clamp(1.1 - dens, 0.15, 1.0);
    vec3 c = imgLod(p * 0.85 + 0.5, 1.5);
    float lamp = 0.8 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 warm = vec3(1.0, 0.92, 0.78);
    vec3 col = mix(c, warm * luma(c), 0.3) * trans * lamp * 1.15 + warm * (1.0 - trans) * 0.08 * lamp;
    finish(col);
}
