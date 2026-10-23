//@doc
 * @brief WAVEGUIDE BUNDLE FACES: a bundle of light guides, a fibre-optic plate: the photo is averaged to points that glow at the fibre ends, and the plate twists about its axis;
 * the fibres thicken with the swell until the points touch and the picture closes.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the plate twists (integrated)
 *   audioSwell      -> the fibres' thickness
 *
 * Knobs: fibresP (how many fibres), hueP.
//@params fibresP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float t = 0.05 * sceneTime + 0.4 * audioPhase;
    float N = 22.0 + 30.0 * clamp(fibresP, 0.0, 1.0);
    float tw = 0.9 * sin(t) * length(p);
    vec2 q0 = rot2(tw) * p;
    vec2 q = q0 * N;
    vec2 r = vec2(1.0, 1.7320508);
    vec2 h = r * 0.5;
    vec2 a = mod(q, r) - h;
    vec2 b = mod(q - h, r) - h;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    vec2 ctr = (q - gv) / N;
    vec3 c = imgLod(rot2(-tw) * ctr * 0.8 + 0.5, 2.0);
    float rad = 0.34 + 0.14 * clamp(audioSwell, 0.0, 1.0);
    float disc = smoothstep(rad, rad * 0.8, length(gv));
    vec3 col = c * (0.08 + 1.1 * disc * (1.0 - 0.3 * length(gv) / rad));
    finish(col * 1.1);
}
