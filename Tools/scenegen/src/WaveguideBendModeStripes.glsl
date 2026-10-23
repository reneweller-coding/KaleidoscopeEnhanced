//@doc
 * @brief WAVEGUIDE BEND MODE STRIPES: a waveguide with a bend: the modes shift to the outer side; the picture shows stripes of the photo that crowd into the curves.  A ring-shaped guide carries three modes whose profiles are sines across the width, squeezed to the outside; they beat along the guide, so bright knots run
 * round, and the photo fills the guide.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the mixture of the modes glides with the key (integrated)
 *   audioAdvance     -> the beat runs round the ring (integrated)
 *
 * Knobs: sizeP (the radius of the ring), hueP.
//@params sizeP
//@audio audioAdvance audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float R0 = 0.3 + 0.16 * clamp(sizeP, 0.0, 1.0);
    float W = 0.2;
    float r = length(p);
    float a = atan(p.y, p.x);
    float n = (r - R0) / W + 0.5;
    float inside = smoothstep(0.0, 0.04, n) * smoothstep(1.0, 0.96, n);
    float ne = pow(clamp(n, 0.0, 1.0), 0.72);
    float t = 0.05 * audioAdvance + 0.08 * sceneTime;
    float mix_ = 0.5 + 0.5 * sin(0.05 * audioHarmAdvance + 0.02 * sceneTime);
    float re = 0.0;
    float im = 0.0;
    for (int m = 1; m <= 3; ++m) {
        float fm = float(m);
        float amp = m == 1 ? 1.0 : (m == 2 ? mix_ : 0.6 * (1.0 - mix_) + 0.2);
        float prof = sin(3.1415927 * fm * ne);
        float beta = 6.0 + 2.0 * fm * fm * 0.6;
        float ph = beta * a - 6.2831853 * t * 0.3 * fm;
        re += amp * prof * cos(ph);
        im += amp * prof * sin(ph);
    }
    float I = re * re + im * im;
    vec3 c = imgLod(vec2(cos(a), sin(a)) * r * 0.85 + 0.5, 0.8);
    c = mix(vec3(luma(c)), c, 1.35);
    vec3 col = c * (0.1 + 1.4 * smoothstep(0.0, 1.3, I)) * inside + imgLod(p * 0.85 + 0.5, 2.5) * 0.1;
    float wall = (1.0 - smoothstep(0.0, 0.006, abs(n))) + (1.0 - smoothstep(0.0, 0.006, abs(n - 1.0)));
    col += vec3(0.7, 0.8, 1.0) * wall * 0.25;
    finish(col);
}
