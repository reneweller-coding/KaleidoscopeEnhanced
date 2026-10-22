//@doc
 * @brief PARTICLE KNOT RIVERS: particles stream through invisible tubes that are knotted -- a torus knot's tube -- so
 * glowing knots made of moving points wind round each other in the dark; each particle runs along the knot at its
 * own place round the tube's cross section, the near ones larger and softer.  When a section changes the knot (a
 * trefoil, a (2,5) knot, a (3,4) knot), every particle glides from its place on the old knot to the same place on
 * the new one, so the river reshapes without a jump.  The particles' colours are shades of one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance       -> the stream along the knot (integrated)
 *   audioSectionId/Age -> every new section changes the knot (the particles glide over six seconds)
 *   audioSwell         -> the tube's width: the stream spreads
 *
 * Knobs: particleP (how many particles), turnP (how the knot turns), hueP.
//@params particleP turnP
//@audio audioSectionId audioSectionPrev audioSectionAge audioSwell
//@body
/**  A point of a torus knot and its frame.
 *
 * @param t     The knot parameter (0..2 pi). (in)
 * @param kind  0 trefoil (2,3), 1 (2,5), 2 (3,4). (in)
 *
 * @return
 *   The point.
 **/
vec3 knot(float t, float kind)
{
    vec2 pq = kind < 0.5 ? vec2(2.0, 3.0) : kind < 1.5 ? vec2(2.0, 5.0) : vec2(3.0, 4.0);
    float r = 0.55 + 0.25 * cos(pq.y * t);
    return vec3(r * cos(pq.x * t), r * sin(pq.x * t), 0.25 * sin(pq.y * t));
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float N = floor(400.0 + 200.0 * clamp(particleP, 0.0, 1.0));
    float flow = 0.04 * sceneTime + 0.15 * audioAdvance;
    float tube = 0.05 + 0.06 * clamp(audioSwell, 0.0, 1.0);
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    float kA = mod(max(audioSectionPrev, 0.0), 3.0), kB = mod(max(audioSectionId, 0.0), 3.0);
    float turn = (0.03 + 0.05 * clamp(turnP, 0.0, 1.0)) * sceneTime;
    vec3 col = famCol(fh, 0.45) * 0.015;
    for (int i = 0; i < 600; ++i) {
        float fi = float(i);
        if (fi >= N) break;
        float h1 = fract(sin(fi * 12.9898) * 43758.5453), h2 = fract(sin(fi * 78.233) * 43758.5453);
        float t = 6.2831853 * fract(h1 + flow * (0.8 + 0.4 * h2));
        vec3 c = mix(knot(t, kA), knot(t, kB), m);
        // the knot lies on a torus: its radial and axial directions frame the tube; four rivers twist round it
        vec3 n1 = normalize(vec3(c.xy, 0.0)), n2 = vec3(0.0, 0.0, 1.0);
        float a = 1.5707963 * floor(4.0 * h2) + 3.0 * t + 0.3 * (fract(h2 * 9.1) - 0.5);
        vec3 x = c + tube * (cos(a) * n1 + sin(a) * n2) * (0.75 + 0.25 * fract(h1 * 7.3));
        x.xz = rot2(turn) * x.xz;
        x.yz = rot2(0.5 + 0.3 * sin(0.7 * turn)) * x.yz;
        x.z += 2.2;
        vec2 sp = x.xy / x.z * 1.6;
        float size = 0.003 + 0.01 / x.z;
        float d = length(p - sp);
        float g = smoothstep(size, size * 0.6, d) + 0.2 * exp(-d / (size * 2.5));
        col += famLight(fh, fract(h2 * 3.0), 0.4) * g * (1.4 / x.z);
    }
    finish(famExpose(col, 2.05, 0.90, 0.00, fh));
}
