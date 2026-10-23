//@doc
 * @brief POLAR GRATING PETALS: a grating in polar coordinates -- an angular and a radial frequency -- modulated by the photo: a pattern of
 * petals in whose blades the photo stands; its brightness bends the lines so the picture is drawn in their wavering.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the petal count steps along with the key (cross-faded, integrated)
 *   audioSwell      -> the radial frequency and the photo's bend
 *   audioAdvance    -> the pattern turns and runs outward (integrated)
 *
 * Knobs: petalsP (the base petal count), radialP (the base radial frequency), hueP.
//@params petalsP radialP
//@audio audioSwell audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = sceneTime * 0.2 + 1.5 * audioAdvance;
    float nf = 5.0 + 10.0 * clamp(petalsP, 0.0, 1.0);
    float n = floor(nf);
    float fr = smoothstep(0.55, 1.0, fract(nf + 0.3 * audioHarmAdvance));
    float th = atan(p.y, p.x);
    float r = length(p);
    float L = luma(imgLod(uv, 1.5));
    float F = 3.0 + 9.0 * clamp(radialP, 0.0, 1.0) + 4.0 * clamp(audioSwell, 0.0, 1.0);
    float ph = 6.2831853 * (F * r - 0.3 * t) + (1.0 - fr) * n * th + fr * (n + 1.0) * th + 3.0 * (0.5 + clamp(audioSwell, 0.0, 1.0)) * L + 0.4 * t;
    vec3 col = imgLod(uv, 0.5) * (0.3 + 0.9 * (0.5 + 0.5 * cos(ph)));
    finish(col);
}
