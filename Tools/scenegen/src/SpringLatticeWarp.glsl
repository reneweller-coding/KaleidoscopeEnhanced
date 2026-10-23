//@doc
 * @brief SPRING LATTICE WARP: a triangular net of nodes, each moving on a small ellipse with its phase set by its place, so that a wave of deformation runs through the net and the photo, stretched on the net, follows it softly: the
 * picture rolls like a sheet on a field of springs, with a fine mesh drawn over it so that the net can be seen.  The size of the ellipses follows the swell, the direction of the wave the phase of the music, and the wave runs once
 * through every bar.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the size of the ellipses
 *   audioPhase      -> the direction of the wave turns (integrated)
 *   audioBarPhase   -> the wave runs once a bar
 *
 * Knobs: netP (the fineness of the net), hueP.
//@params netP
//@audio audioSwell
//@body
/**  The displacement of a node of the net.
 *
 * @param node  The node's place in the plane. (in)
 * @param kv    The wave vector. (in)
 * @param A     The size of the ellipse. (in)
 *
 * @return
 *   The displacement.
 **/
vec2 springNode(vec2 node, vec2 kv, float A)
{
    float ph = dot(kv, node) - 6.2831853 * rhyBar();
    return A * vec2(cos(ph), 0.6 * sin(1.3 * ph + 1.0));
}
void main()
{
    vec2 p = screenP();
    float s = 0.22 - 0.12 * clamp(netP, 0.0, 1.0);
    vec2 q = vec2(p.x + p.y * 0.57735, p.y * 1.1547) / s;
    vec2 i = floor(q), f = q - i;
    bool lowT = f.x + f.y < 1.0;
    vec2 n0 = lowT ? i : i + vec2(1.0, 1.0);
    vec2 n1 = lowT ? i + vec2(1.0, 0.0) : i + vec2(0.0, 1.0);
    vec2 n2 = lowT ? i + vec2(0.0, 1.0) : i + vec2(1.0, 0.0);
    vec3 w = lowT ? vec3(1.0 - f.x - f.y, f.x, f.y) : vec3(f.x + f.y - 1.0, 1.0 - f.y, 1.0 - f.x);
    float ang = 0.1 * audioPhase + 0.02 * sceneTime;
    vec2 kv = 5.0 * vec2(cos(ang), sin(ang));
    float A = 0.05 + 0.1 * clamp(audioSwell, 0.0, 1.0);
    vec2 P0 = s * vec2(n0.x - 0.5 * n0.y, 0.866 * n0.y), P1 = s * vec2(n1.x - 0.5 * n1.y, 0.866 * n1.y), P2 = s * vec2(n2.x - 0.5 * n2.y, 0.866 * n2.y);
    vec2 D = w.x * springNode(P0, kv, A) + w.y * springNode(P1, kv, A) + w.z * springNode(P2, kv, A);
    vec3 c = imgLod((p - D) * 0.8 + 0.5, 0.7);
    float mesh = smoothstep(0.04, 0.0, min(w.x, min(w.y, w.z)));
    finish(c * (1.0 - 0.35 * mesh) * 1.08);
}
