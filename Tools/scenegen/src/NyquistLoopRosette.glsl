//@doc
 * @brief NYQUIST LOOP ROSETTE: Nyquist plots: the photo lies as a plane through which the loops of a transfer function run; the order and the poles wander, and the picture shows its own loops that wind round the point minus one.  Four loops from four sets of poles, each drawn as a
 * thin curve in the colour of the photo beneath it.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the poles wander (integrated)
 *   audioHarmAdvance -> the gain, and with it the number of windings, glides
 *
 * Knobs: sizeP (the scale of the plane), hueP.
//@params sizeP
//@audio audioAdvance audioHarmAdvance
//@body
vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 cdiv(vec2 a, vec2 b) { return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / dot(b, b); }
void main()
{
    vec2 p = screenP();
    float sc = 0.34 + 0.2 * clamp(sizeP, 0.0, 1.0);
    vec3 col = imgLod(p * 0.85 + 0.5, 1.8) * 0.4;
    float t = 0.02 * audioAdvance + 0.02 * sceneTime;
    float gain = 2.5 + 2.0 * (0.5 + 0.5 * sin(0.06 * audioHarmAdvance));
    for (int c = 0; c < 4; ++c) {
        float fc = float(c);
        float a = 0.3 + 0.25 * (0.5 + 0.5 * sin(t + fc * 1.7));
        float b = 0.8 + 0.6 * (0.5 + 0.5 * sin(1.3 * t + fc * 2.3));
        float d = 1.6 + 1.0 * (0.5 + 0.5 * sin(0.8 * t + fc * 3.1));
        float K = gain * (0.8 + 0.2 * fc);
        vec2 q0 = vec2(0.0);
        float dm = 1e3;
        for (int i = 0; i <= 56; ++i) {
            float om = 0.04 * exp(0.1 * float(i)) ;
            vec2 s = vec2(0.0, om);
            vec2 den = cmul(cmul(s + vec2(a, 0.0), s + vec2(b, 0.0)), s + vec2(d, 0.0));
            vec2 G = cdiv(vec2(K, 0.0), den) * (1.0 + 0.0);
            vec2 q1 = G * sc;
            if (i > 0) {
                dm = min(dm, sdSeg(p, q0, q1));
                dm = min(dm, sdSeg(p, vec2(q0.x, -q0.y), vec2(q1.x, -q1.y)));
            }
            q0 = q1;
        }
        vec3 pc = imgLod(p * 0.85 + 0.5, 0.8);
        pc = mix(vec3(luma(pc)), pc, 1.5);
        float al = 1.0 - smoothstep(0.002, 0.007, dm);
        col = mix(col, pc * 1.5 + 0.1, al);
    }
    float cr = 1.0 - smoothstep(0.0, 0.01, abs(length(p - vec2(-1.0 * sc, 0.0)) - 0.02));
    col = mix(col, vec3(1.0, 0.3, 0.3), cr * 0.8);
    finish(col);
}
