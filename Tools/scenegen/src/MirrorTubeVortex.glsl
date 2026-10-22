//@doc
 * @brief MIRROR TUBE VORTEX: a mirror tube twisted like a wrung cloth: its walls' images, which in a straight tube
 * form rings of facets running into the distance, now wind into a screw that turns into infinity, and the eye
 * travels down it.  Optics: looking down a tube with n mirror walls, the images sit in rings at depths growing
 * with each pair of bounces; in log-polar coordinates (log of the radius, angle) those rings are rows, and the
 * twist shears the angle with the depth.  A ray in the direction (angle, log radius) is folded into one wall's
 * wedge, the bounces counted from the ring it belongs to; every bounce costs a tenth of the light.  The content at
 * the far end is the photo, in one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the twist tightens
 *   audioAdvance -> the travel down the tube (integrated): the screw runs on without end
 *
 * Knobs: wallP (the number of walls), ringP (how close the rings sit), hueP.
//@params wallP ringP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float walls = 2.0 * floor(2.0 + 2.5 * clamp(wallP, 0.0, 1.0));   // an even count: the mirrored wedges close up
    float ringW = 0.35 + 0.35 * clamp(ringP, 0.0, 1.0);        // log-radius per ring
    float twist = 0.35 + 0.65 * clamp(audioSwell, 0.0, 1.0);
    float travel = 0.04 * sceneTime + 0.2 * audioAdvance;
    float r = max(length(p), 1e-4);
    float lr = log(r) + travel;                                  // the depth coordinate, running on
    // the twist shears the angle with depth: a fixed screw along the tube, its tightening only near the eye's view
    float a = atan(p.y, p.x) + 0.5 * travel + twist * log(r);
    // the ring and the wedge: the wedge folded into the first wall, odd rings and odd wedges mirrored
    float ring = floor(lr / ringW);
    float v = lr / ringW - ring;
    float wedge = 6.2831853 / walls;
    float k = floor(a / wedge);
    float u = a / wedge - k;
    if (mod(k, 2.0) > 0.5) u = 1.0 - u;
    if (mod(ring, 2.0) > 0.5) v = 1.0 - v;
    // deeper rings (toward the middle) are more bounces away; so are the wedges round the back
    float bounces = 2.0 * max(log(0.9) - log(r), 0.0) / ringW + 0.4 * abs(mod(k, walls) - 0.5 * walls);
    vec2 uv = vec2(u, v) * 0.85 + 0.08 + 0.05 * vec2(sin(0.03 * sceneTime), cos(0.02 * sceneTime));
    vec3 photo = imgLod(uv, 0.9);
    vec3 col = famCol(fh, 0.15 + 0.7 * luma(photo)) * (0.25 + 1.2 * luma(photo)) * pow(0.9, bounces);
    // the walls' seams and the rings' joins; the far centre melts into light
    float seam = min(min(u, 1.0 - u) * wedge * r, min(v, 1.0 - v) * ringW * r);
    col *= smoothstep(0.0, 0.004, seam);
    col = mix(col, famLight(fh, 0.6, 0.5) * 0.5, smoothstep(0.08, 0.0, r));
    finish(col);
}
