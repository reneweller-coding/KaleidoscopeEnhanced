//@doc
 * @brief FRESNEL SHEET FACETS: a Fresnel lens sheet in front of the photo: concentric prism rings displace the strips of the picture, each ring differently, so that the photo jumps in circles and yet runs on steadily; the centre of the rings wanders.
 * The three colours are displaced a little differently, as in real prisms, so the ring edges have colour fringes.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the centre wanders (integrated)
 *   audioSwell   -> the strength of the prisms
 *
 * Knobs: sizeP (the width of the rings), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    vec2 cen = vec2(0.3 * sin(0.03 * audioAdvance + 0.05 * sceneTime), 0.2 * cos(0.025 * audioAdvance + 0.04 * sceneTime));
    vec2 q = p - cen;
    float r = length(q);
    float w = 0.035 + 0.06 * clamp(sizeP, 0.0, 1.0);
    float fr = fract(r / w);
    float S = 0.45 + 0.45 * clamp(audioSwell, 0.0, 1.0);
    vec2 dir = q / max(r, 1e-4);
    float disp = (fr - 0.5) * w * S * 2.0;
    vec3 col;
    for (int k = 0; k < 3; ++k) {
        float dk = disp * (1.0 + 0.12 * (float(k) - 1.0));
        vec2 uv = (p - dir * dk) * 0.8 + 0.5;
        vec3 c = imgLod(uv, 0.5);
        col[k] = c[k];
    }
    float groove = smoothstep(0.0, 0.05, fr) * (1.0 - 0.0 * fr);
    col *= 0.78 + 0.28 * groove;
    finish(col * 1.1);
}
