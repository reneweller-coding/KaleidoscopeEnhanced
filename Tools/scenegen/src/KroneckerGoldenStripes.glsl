//@doc
 * @brief KRONECKER GOLDEN STRIPES: the photo on a torus, read along a straight line of golden slope: stripe after stripe, each carrying the photo from a place that is the previous one's plus the golden number (a Kronecker sequence),
 * so the stripes nearly repeat and never exactly -- every n-th stripe is nearly the same, and no one is.  The slope wanders about the golden value with the chords of the music, the stripes run with the phase.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the slope wanders about the golden value
 *   audioPhase      -> the stripes run (integrated)
 *
 * Knobs: stripeP (the width of the stripes), hueP.
//@params stripeP
//@audio audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float phi = 1.6180339 + 0.12 * sin(0.45 * audioHarmAdvance);
    float ang = 0.45 + 0.08 * sin(0.02 * sceneTime);
    vec2 d = vec2(cos(ang), sin(ang)), dp = vec2(-d.y, d.x);
    float N = 8.0 + 14.0 * (1.0 - clamp(stripeP, 0.0, 1.0));
    float u = dot(p, d) * N + 0.05 * audioPhase + 0.01 * sceneTime;
    float k = floor(u);
    float l = fract(u);
    float m = dot(p, dp);
    vec2 uv = vec2(fract(k * phi) * 0.8 + 0.1 + (l - 0.5) * 0.12, m * 0.8 + 0.5 + 0.3 * fract(k * phi * phi));
    vec3 c = imgLod(uv, 0.7);
    float edge = smoothstep(0.0, 0.06, min(l, 1.0 - l));
    finish(c * (0.7 + 0.3 * edge) * 1.08);
}
