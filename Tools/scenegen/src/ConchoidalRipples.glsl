//@doc
 * @brief CONCHOIDAL RIPPLES: conchoidal fracture: concentric Wallner lines run out from the fracture points, and the photo breaks along the waves into shell-shaped flakes, each flake a little displaced and shaded by the slope of its
 * ripple, so the surface looks like broken flint or glass.  The fracture point wanders with the phase of the music, the number of ripples follows the spectral spread.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the fracture point wanders (integrated)
 *   audioSpread     -> the number of ripples
 *
 * Knobs: rippleP (how coarse the ripples are), hueP.
//@params rippleP
//@audio audioSpread
//@body
void main()
{
    vec2 p = screenP();
    float t = 0.01 * sceneTime + 0.06 * audioPhase;
    vec2 c1 = vec2(0.45 * sin(2.0 * t), 0.2 * sin(3.0 * t + 1.0));
    vec2 c2 = vec2(-0.5 * sin(1.6 * t + 2.0), -0.2 * sin(2.5 * t));
    vec2 d1 = p - c1, d2 = p - c2;
    float r1 = length(d1), r2 = length(d2);
    float N = (8.0 + 12.0 * (1.0 - clamp(rippleP, 0.0, 1.0))) * (0.7 + 0.6 * clamp(audioSpread, 0.0, 1.0));
    float u1 = r1 * N, u2 = r2 * N * 0.9;
    bool first = u1 < u2 * 1.0 + 0.0;
    float u = first ? u1 : u2;
    vec2 dd = first ? d1 / max(r1, 1e-3) : d2 / max(r2, 1e-3);
    float sh = floor(u), f = fract(u);
    vec2 off = (hash22(vec2(sh, first ? 1.0 : 5.0)) - 0.5) * 0.06;
    vec3 c = imgLod((p + off + dd * 0.03 * f) * 0.8 + 0.5, 0.8);
    float slope = 0.65 + 0.7 * smoothstep(0.0, 1.0, f);
    float line = smoothstep(0.0, 0.06, f);
    finish(c * slope * (0.55 + 0.45 * line) * 1.1);
}
