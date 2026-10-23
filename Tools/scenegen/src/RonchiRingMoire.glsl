//@doc
 * @brief RONCHI RING MOIRE: two concentric ring gratings with shifted centres throw hyperbolic fringes where they overlap; the photo's
 * colours stand in the fringes (the fringe order picks the window of the picture) and the dark fringes between them show the
 * photo dimmed.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the distance between the two centres
 *   audioAdvance    -> the centres circle each other (integrated)
 *
 * Knobs: ringsP (the rings' density), shiftP (how far a fringe moves the window), hueP.
//@params ringsP shiftP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = sceneTime * 0.2 + 1.5 * audioAdvance;
    float d = 0.04 + 0.16 * clamp(audioSwell, 0.0, 1.0);
    vec2 c1 = d * vec2(cos(t), sin(t)), c2 = -c1;
    float N = 18.0 + 30.0 * clamp(ringsP, 0.0, 1.0);
    float r1 = length(p - c1), r2 = length(p - c2);
    float fr = N * (r1 - r2);
    float ring = 0.5 + 0.5 * cos(6.2831853 * fr);
    float order = floor(fr);
    vec2 off = (hash22(vec2(order, 3.0)) - 0.5) * 0.25 * (0.3 + clamp(shiftP, 0.0, 1.0));
    vec3 col = imgLod(uv + off * smoothstep(0.0, 1.0, ring), 0.5) * (0.4 + 0.85 * ring) + 0.08 * imgLod(uv, 4.0);
    finish(col);
}
