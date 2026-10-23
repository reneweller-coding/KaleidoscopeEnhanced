//@doc
 * @brief PEYOTE BEADWORK: beadwork in peyote stitch: the photo made of beads, every second row shifted by half a bead, every bead a small shaded oval in its own colour with a bright glint,
 * the beads shimmering and the whole fabric sliding slowly sideways.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the fabric slides (integrated)
 *   audioSwell      -> the shimmer's strength
 *
 * Knobs: beadsP (how many beads), hueP.
//@params beadsP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float t = 0.05 * sceneTime + 0.4 * audioPhase;
    float R = 26.0 + 32.0 * clamp(beadsP, 0.0, 1.0);
    float row = floor(p.y * R);
    float fy = fract(p.y * R) - 0.5;
    float W = R * 0.62;
    float x = (p.x + 0.05 * t) * W + 0.5 * mod(row, 2.0);
    float cx = floor(x);
    float fx = fract(x) - 0.5;
    vec2 cp = vec2((cx + 0.5 - 0.5 * mod(row, 2.0)) / W - 0.05 * t, (row + 0.5) / R);
    vec3 c = imgLod(cp * 0.8 + 0.5, 1.5);
    vec2 d = vec2(fx / 0.5, fy / 0.5);
    float r2 = dot(d, d);
    float bead = smoothstep(1.0, 0.85, r2);
    float shade = 0.55 + 0.6 * sqrt(max(1.0 - r2, 0.0));
    float glint = smoothstep(0.1, 0.0, length(d - vec2(-0.3, -0.35))) * (0.4 + 0.5 * clamp(audioSwell, 0.0, 1.0));
    float shim = 0.9 + 0.2 * sin(6.0 * hash21(vec2(cx, row)) + 2.0 * t * 6.0);
    vec3 col = vec3(0.04) + c * shade * shim * bead + glint * bead;
    finish(col * 1.1);
}
