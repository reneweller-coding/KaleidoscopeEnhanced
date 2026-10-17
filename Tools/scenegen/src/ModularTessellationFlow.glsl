//@doc
 * @brief MODULAR TESSELLATION FLOW: the upper half-plane tiled by the modular group -- every tile a copy of the same
 * curved triangle, mapped by an integer matrix of determinant one, the tiles shrinking toward the real line and
 * crowding at every rational point -- seen in the disc model: the half-plane folded into a disc that spans the
 * frame's height, the real line become its rim, mirrored in the rim beyond it.  A one-parameter flow of the group slides the whole tessellation: turning about
 * the disc's middle, or streaming along a hyperbolic axis, or creeping parabolically round the cusp -- the kind of
 * flow changes with the harmony.  Every tile shows the photo, mapped through its own matrix; its two halves are light
 * and dark, so the triangles alternate like Klein's picture of the group.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> each change of harmony switches the kind of flow (elliptic, hyperbolic, parabolic; crossfaded)
 *   audioPhase      -> the flow's progress (integrated)
 *   audioKick       -> the tile edges flash (light)
 *
 * Knobs: viewP (how much of the disc), speedP (the flow's speed), photoP (photo share), hueP.
//@params viewP speedP photoP
//@audio audioKick audioHarmAdvance
//@body
/**  Complex division.
 *
 * @param a  The numerator. (in)
 * @param b  The denominator. (in)
 *
 * @return
 *   a / b.
 **/
vec2 cdivM(vec2 a, vec2 b) { return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / max(dot(b, b), 1e-12); }
/**  A Moebius map (a z + b) / (c z + d) with real coefficients.
 *
 * @param z  The point. (in)
 * @param m  The coefficients a, b, c, d. (in)
 *
 * @return
 *   The image.
 **/
vec2 moebius(vec2 z, vec4 m) { return cdivM(m.x * z + vec2(m.y, 0.0), m.z * z + vec2(m.w, 0.0)); }

/**  The tile of the modular tessellation holding a point: reduction to the fundamental domain, keeping the word.
 *
 * @param z  The point (Im z > 0). (in)
 *
 * @return
 *   The point in the fundamental domain (xy), a hash of the reducing word (z), the distance to the domain's edge (w).
 **/
vec4 reduce(vec2 z)
{
    float word = 0.0;
    for (int i = 0; i < 40; ++i) {
        float n = floor(z.x + 0.5);
        z.x -= n;
        word = fract(word * 1.618 + n * 0.125 + 0.31);     // n and n + 8 alike: the slide wraps unseen
        if (dot(z, z) >= 1.0) break;
        z = cdivM(vec2(-1.0, 0.0), z);
        word = fract(word * 2.71 + 0.53);
    }
    float edge = min(abs(abs(z.x) - 0.5), length(z) - 1.0);
    return vec4(z, word, edge);
}

void main()
{
    vec2 p = screenP();
    vec2 w = p / (1.15 - 0.2 * clamp(viewP, 0.0, 1.0));       // the disc
    float ww = dot(w, w);
    if (ww > 1.0) { w /= ww; ww = 1.0 / ww; }                  // beyond the rim: its mirror image
    vec2 z = cdivM(vec2(1.0 + w.x, w.y), vec2(1.0 - w.x, -w.y));
    z = vec2(-z.y, max(z.x, 1e-4));                             // times i: the Cayley map onto the half-plane
    float t = (0.1 + 0.25 * clamp(speedP, 0.0, 1.0)) * sceneTime + 0.03 * audioPhase;
    float h = max(audioHarmAdvance, 0.0);
    int kA = int(mod(floor(h), 3.0)), kB = int(mod(floor(h) + 1.0, 3.0));
    float g = smoothstep(0.2, 0.8, fract(h));
    vec3 col = vec3(0.0);
    for (int j = 0; j < 2; ++j) {
        int kind = j == 0 ? kA : kB;
        float w = j == 0 ? 1.0 - g : g;
        if (w < 0.001) continue;
        vec4 m;
        if (kind == 0) m = vec4(cos(t), sin(t), -sin(t), cos(t));          // elliptic: a turn about i
        else if (kind == 1) m = vec4(exp(0.5 * sin(t)), 0.0, 0.0, exp(-0.5 * sin(t)));   // hyperbolic: along i R
        else m = vec4(1.0, mod(t * 0.3, 8.0), 0.0, 1.0);                  // parabolic: along the line
        vec4 r = reduce(moebius(z, m));
        vec2 uv = vec2(r.x + 0.5, (min(r.y, 2.2) - 0.8) * 0.6) * 0.7 + 0.15 + vec2(r.z, fract(r.z * 3.7)) * 0.2;
        vec3 photo = imgLod(uv, 0.4);
        vec3 tone = imgPalette(r.z + 0.03 * audioPhase);
        vec3 c = mix(tone * 1.1, photo * 1.25, 0.4 + 0.5 * clamp(photoP, 0.0, 1.0)) * (r.x > 0.0 ? 1.2 : 0.45);
        float edge = 1.0 - smoothstep(0.0, 0.03, r.w);
        c = mix(c, mix(tone, vec3(1.0), 0.5) * (0.5 + 0.7 * clamp(audioKick, 0.0, 1.0)), edge * 0.7);
        col += w * c;
    }
    col *= smoothstep(0.0, 0.04, 1.0 - ww);                     // the rim itself: the tiles' limit, dark
    finish(col);
}
