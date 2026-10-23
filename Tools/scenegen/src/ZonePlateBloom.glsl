//@doc
 * @brief ZONE PLATE BLOOM: a Fresnel zone plate whose rings are modulated by the photo: the picture appears as the phase of the
 * rings, which crowd closer toward the edge; where the photo is bright the rings shift forward, where it is dark back, so the
 * picture is drawn in the bending of the rings, in its own colours.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the ring count glides to the next simple ratio with each harmonic change (integrated)
 *   audioAdvance    -> the rings run outward (integrated)
 *   audioSwell      -> how strongly the photo bends the rings
 *
 * Knobs: ringsP (the base ring count), centreP (how far the plate's centre wanders), hueP.
//@params ringsP centreP
//@audio audioSwell audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = sceneTime * 0.3 + 2.0 * audioAdvance;
    vec2 c0 = 0.12 * clamp(centreP, 0.0, 1.0) * vec2(sin(0.13 * t), cos(0.11 * t));
    float r2 = dot(p - c0, p - c0);
    float N = 14.0 + 30.0 * clamp(ringsP, 0.0, 1.0) + 4.0 * sin(0.4 * audioHarmAdvance);
    vec3 c = imgLod(uv, 0.5);
    float L = luma(imgLod(uv, 1.5));
    float ph = 6.2831853 * (N * r2 - 0.4 * t) + 6.2831853 * (0.6 + 1.6 * clamp(audioSwell, 0.0, 1.0)) * L;
    float ring = 0.5 + 0.5 * cos(ph);
    vec3 col = c * (0.25 + 1.0 * smoothstep(0.1, 0.9, ring)) + 0.1 * imgLod(uv, 4.0);
    finish(col);
}
