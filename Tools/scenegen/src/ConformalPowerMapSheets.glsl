//@doc
 * @brief CONFORMAL POWER MAP SHEETS: the conformal power maps z -> z^n and z -> 1/z, whose sheets lie on top of each other; the picture shows n sheets of the photo that join at the origin.  The point under every pixel is raised to the power n (an integer that changes by cross-fading neighbouring integers) and the photo is read
 * there; the sheets meet in a branch point.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the number of sheets follows the key (the integers are cross-faded) (integrated)
 *   audioAdvance     -> the whole turns (integrated)
 *
 * Knobs: sizeP (the zoom), hueP.
//@params sizeP
//@audio audioAdvance audioHarmAdvance
//@body
vec2 cpow(vec2 z, float n)
{
    float r = length(z);
    float a = atan(z.y, z.x);
    return pow(r, n) * vec2(cos(n * a), sin(n * a));
}
void main()
{
    vec2 p = screenP() * (1.2 + 1.2 * (1.0 - clamp(sizeP, 0.0, 1.0)));
    float rot = 0.012 * audioAdvance + 0.02 * sceneTime;
    vec2 z = rot2(rot) * p;
    float nf = 2.0 + 3.0 * (0.5 + 0.5 * sin(0.05 * audioHarmAdvance + 0.015 * sceneTime));
    float n0 = floor(nf);
    float f = smoothstep(0.0, 1.0, fract(nf));
    vec2 w0 = cpow(z, n0);
    vec2 w1 = cpow(z, n0 + 1.0);
    vec3 a = imgLod(w0 * 0.5 + 0.5, 0.6);
    vec3 b = imgLod(w1 * 0.5 + 0.5, 0.6);
    float rr = length(p);
    finish(mix(a, b, f) * 1.1 * (0.5 + 0.5 * smoothstep(0.0, 0.08, rr)));
}
