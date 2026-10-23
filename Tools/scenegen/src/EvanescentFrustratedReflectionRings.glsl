//@doc
 * @brief EVANESCENT FRUSTRATED REFLECTION RINGS: frustrated total reflection: where a second body comes near enough, light tunnels through the gap and shows up as a ring; the picture shows rings of the photo that light up where two surfaces approach.  A lens lies on a plate at a tilt: the gap grows with the square of the
 * distance from the contact point; where it is small the photo shines through, beyond it Newton rings run and the rest mirrors a dark, blurred copy.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the gap: the pressure of the lens (the size of the contact patch)
 *   audioAdvance -> the contact point wanders (integrated)
 *
 * Knobs: sizeP (the radius of curvature), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    vec2 cen = 0.25 * vec2(sin(0.012 * audioAdvance + 0.02 * sceneTime), cos(0.01 * audioAdvance + 0.015 * sceneTime));
    vec2 d = p - cen;
    float r2 = dot(d, d);
    float curv = 3.0 + 6.0 * (1.0 - clamp(sizeP, 0.0, 1.0));
    float gap = (r2 * curv) * (1.0 - 0.7 * clamp(audioSwell, 0.0, 1.0)) + 0.002 + 0.03 * dot(d, vec2(0.5, 0.2));
    float contact = exp(-gap * 40.0);
    float ring = 0.5 + 0.5 * cos(6.2831853 * gap * 30.0);
    vec3 c = imgLod(p * 0.85 + 0.5, 0.8);
    c = mix(vec3(luma(c)), c, 1.3);
    vec3 mirror = imgLod(p * 0.85 + 0.5, 3.0) * 0.28 + vec3(0.02, 0.03, 0.06);
    vec3 rings = mix(vec3(0.0), c, 0.5 + 0.5 * ring) * exp(-gap * 6.0);
    vec3 col = mirror + c * 1.4 * contact + rings * 0.9;
    finish(col);
}
