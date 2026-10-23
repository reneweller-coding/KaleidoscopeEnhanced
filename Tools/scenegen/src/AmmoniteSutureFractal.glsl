//@doc
 * @brief AMMONITE SUTURE FRACTAL: ammonite sutures: the septa of a shell draw fractal lines where they meet the wall; the picture shows the suture lines in growing branching, with the photo in the chambers.  The chambers are the turns of a logarithmic spiral cut by wiggling lines whose wiggle is a sum of
 * doubled frequencies; the number of doublings (the depth of the branching) glides.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the depth of the branching (the number of octaves in the wiggle)
 *   audioAdvance -> the shell turns slowly (integrated)
 *
 * Knobs: sizeP (the number of chambers per turn), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float r = length(p) + 1e-4;
    float th = atan(p.y, p.x) + 0.01 * audioAdvance + 0.01 * sceneTime;
    float N = 14.0 + 12.0 * clamp(sizeP, 0.0, 1.0);
    float depth = 1.0 + 4.0 * clamp(audioSwell, 0.0, 1.0);
    float wig = 0.0;
    for (int k = 0; k < 6; ++k) {
        float w = clamp(depth - float(k), 0.0, 1.0);
        float f = exp2(float(k));
        wig += w * sin(f * 5.0 * th + 1.3 * float(k)) / f;
    }
    float s = log(r / 0.025) * 2.4 - th / 6.2831853 * 1.0 + 0.0;
    float u = s * 1.0;
    float cham = fract(u * 1.0 + 0.04 * wig * 4.0);
    float idx = floor(u + 0.04 * wig * 4.0);
    float lineD = abs(cham - 0.5);
    float suture = 1.0 - smoothstep(0.43, 0.49, lineD);
    float spiralTurn = 0.0;
    vec3 c = imgLod(rot2(0.6 * idx) * p * 0.85 + 0.5, 1.0);
    c = mix(vec3(luma(c)), c, 1.3) * (0.6 + 0.5 * cham);
    float rim = smoothstep(0.52, 0.48, r);
    vec3 col = mix(c * 1.2, vec3(0.04, 0.03, 0.03), suture * 0.85);
    vec3 bg = imgLod(p * 0.85 + 0.5, 2.5) * 0.12;
    finish(mix(bg, col, smoothstep(1.0, 0.88, r) * smoothstep(0.02, 0.04, r)));
}
