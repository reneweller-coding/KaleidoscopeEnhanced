//@doc
 * @brief BESSEL RING WEAVE: Bessel beams -- non-diffracting light whose cross-section is a bright core in rings, or,
 * at higher order, a dark core in rings with a twisting phase -- several of them overlapping, so their ring systems
 * weave a moire of arcs and knots.  The beams drift and their phases turn; the rings carry the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> each change of harmony raises or lowers the beams' order (gliding)
 *   audioPhase      -> the twisting phases turn (integrated)
 *   audioSwell      -> the rings' spacing breathes
 *   audioKick       -> the cores flash (light)
 *
 * Knobs: beamsP (how many beams), ringP (the ring spacing), photoP (photo share), hueP.
//@params beamsP ringP photoP
//@audio audioSwell audioKick audioHarmAdvance
//@body
/**  The Bessel function J_n: near zero by its integral (24 midpoint samples, (1 / pi) int_0^pi cos(n t - x sin t)
 * dt), further out by the asymptotic form sqrt(2 / (pi x)) cos(x - n pi / 2 - pi / 4), blended between 7 and 9.
 *
 * @param n  The order. (in)
 * @param x  The argument, >= 0. (in)
 *
 * @return
 *   J_n(x).
 **/
float besselJ(float n, float x)
{
    float far = sqrt(2.0 / (3.14159265 * max(x, 1e-3))) * cos(x - n * 1.5707963 - 0.7853982);
    if (x > 9.0) return far;
    float s = 0.0;
    for (int i = 0; i < 24; ++i) {
        float t = 3.14159265 * (float(i) + 0.5) / 24.0;
        s += cos(n * t - x * sin(t));
    }
    return mix(s / 24.0, far, smoothstep(7.0, 9.0, x));
}

void main()
{
    vec2 p = screenP();
    int nb = 2 + int(3.0 * clamp(beamsP, 0.0, 1.0));
    float h = max(audioHarmAdvance, 0.0);
    float order = mod(floor(h), 4.0) + smoothstep(0.2, 0.8, fract(h));
    float k = (25.0 + 30.0 * clamp(ringP, 0.0, 1.0)) * (0.9 + 0.2 * clamp(audioSwell, 0.0, 1.0));
    vec2 s = vec2(0.0);
    for (int i = 0; i < 5; ++i) {
        if (i >= nb) break;
        float fi = float(i);
        vec2 c = 0.45 * vec2(sin(0.03 * sceneTime + fi * 2.1), cos(0.025 * sceneTime + fi * 1.3)) * vec2(1.4, 0.8);
        vec2 d = p - c;
        float r = length(d), th = atan(d.y, d.x);
        float n0 = floor(order), f = fract(order);
        float J = mix(besselJ(n0, k * r), besselJ(n0 + 1.0, k * r), f);
        float ph = mix(n0, n0 + 1.0, f) * th + 0.1 * audioPhase * (1.0 + fi * 0.3);
        s += J * vec2(cos(ph), sin(ph));
    }
    float I = dot(s, s);
    float lit = 1.0 - exp(-I * 4.0);
    vec2 uv = p * 0.7 + 0.5;
    vec3 photo = imgLod(uv, 0.5);
    vec3 tone = imgPalette(atan(s.y, s.x) / 6.2831853 + 0.03 * audioPhase);
    vec3 col = mix(tone * 1.2, photo * 1.4, 0.35 + 0.5 * clamp(photoP, 0.0, 1.0)) * lit + photo * 0.06;
    col += mix(tone, vec3(1.0), 0.6) * smoothstep(0.85, 1.0, lit) * 0.3 * (0.5 + clamp(audioKick, 0.0, 1.0));
    finish(col);
}
