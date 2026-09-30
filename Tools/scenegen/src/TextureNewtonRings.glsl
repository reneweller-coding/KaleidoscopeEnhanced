//@doc
 * @brief TEXTURE NEWTON RINGS: Newton's rings where a curved glass touches a
 * flat -- concentric rainbow rings of interference fan out from several
 * contact points pressed onto the photograph, the rings tightening toward
 * the edges, their colours running through the interference orders; the
 * glasses slowly slide and press harder, so the ring systems breathe and
 * merge into contour-like patterns over the picture.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the glasses slide (integrated, jump-free)
 *   audioSpread     -> ring spacing (the glass curvature)
 *   audioBass       -> pressing harder (the dark centre spreads, smoothed light-level)
 *   audioMode       -> the light: white; sodium-yellow (monochrome rings) at very major moments
 *   audioKick       -> the rings brighten (light)
 *   audioSwell      -> the photo shows through (slow)
 *
 * Knobs: contactP (contact points), orderP (visible orders), photoP (photo visibility), hueP.
//@params contactP orderP photoP
//@audio audioSpread audioBass audioMode audioKick audioSwell
//@body
vec3 interf(float d)
{
    return 0.5 + 0.5 * cos(6.2831853 * d * vec3(1.0 / 0.65, 1.0 / 0.53, 1.0 / 0.45));
}

void main()
{
    vec2 p = screenP();
    float bass = clamp(audioBass, 0.0, 1.0);
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float T = 0.04 * sceneTime + 0.3 * audioAdvance;
    // Air gap: the minimum over several spherical glasses resting on the flat.
    float curv = 3.0 + 6.0 * clamp(audioSpread, 0.0, 1.0);
    float gap = 1e3;
    float nC = 2.0 + 3.0 * clamp(contactP, 0.0, 1.0);
    for (int i = 0; i < 5; ++i) {
        float fi = float(i);
        float on = step(fi, nC - 0.5);
        if (on < 0.5) break;
        vec2 c = vec2(0.8 * sin(T * (0.6 + 0.2 * fi) + fi * 2.1), 0.45 * cos(T * (0.5 + 0.3 * fi) + fi * 1.3));
        float press = 0.02 + 0.05 * bass + 0.02 * sin(0.2 * sceneTime + fi);
        float g = max(dot(p - c, p - c) * curv - press, 0.0);
        gap = min(gap, g);
    }
    // Interference: optical path twice the gap; orders fade with thickness.
    float d = gap * 2.0;
    float orders = 2.0 + 6.0 * clamp(orderP, 0.0, 1.0);
    float vis = exp(-d / orders);
    vec3 white = interf(d);
    vec3 sodium = vec3(1.0, 0.8, 0.2) * (0.5 + 0.5 * cos(6.2831853 * d / 0.589));
    vec3 rings = mix(white, sodium, smoothstep(0.75, 0.95, mode));
    // Contact spot: dark (the half-wave phase shift).
    rings *= smoothstep(0.0, 0.08, d);
    vec2 uv = p * 0.5 + 0.5;
    vec3 ph = imgLod(uv, 1.5) * (0.3 + 0.7 * clamp(photoP, 0.0, 1.0)) * (0.5 + 0.6 * swell);
    vec3 col = mix(ph, mix(ph, rings, 0.8) * (1.0 + 0.4 * kick), vis);
    col = mix(col, col * glowColour(ph, p, hueP * 0.159) * 1.2, 0.05);
    finish(col);
}
