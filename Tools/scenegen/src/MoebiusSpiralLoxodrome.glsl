//@doc
 * @brief MOEBIUS SPIRAL LOXODROME: Moebius transformations: two fixed points round which the photo streams in logarithmic spirals; the picture shows flow lines of the photo between source and sink.  The plane is mapped by the one-parameter group of a loxodromic Moebius map with fixed points at two places; the
 * photo is read at the image of every pixel after a time that runs on, so it flows out of the one point into the other.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance     -> the flow runs (integrated)
 *   audioHarmAdvance -> the fixed points move apart and together with the key (integrated)
 *
 * Knobs: sizeP (the spiral rate), hueP.
//@params sizeP
//@audio audioAdvance audioHarmAdvance
//@body
vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 cdiv(vec2 a, vec2 b) { return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / dot(b, b); }
void main()
{
    vec2 z = screenP() * 1.3;
    float sep = 0.45 + 0.2 * sin(0.04 * audioHarmAdvance + 0.015 * sceneTime);
    vec2 a = vec2(-sep, 0.0);
    vec2 b = vec2(sep, 0.0);
    float t = 0.012 * audioAdvance + 0.02 * sceneTime;
    float lam = 0.9 * t * 6.0;
    float mu = (0.6 + 1.6 * clamp(sizeP, 0.0, 1.0)) * t * 6.0;
    vec2 w = cdiv(z - a, z - b);
    float r = length(w);
    float an = atan(w.y, w.x);
    vec2 w2 = exp(lam) * r * vec2(cos(an + mu), sin(an + mu));
    vec2 z2 = cdiv(a - cmul(b, w2), vec2(1.0, 0.0) - w2);
    vec3 c = imgLod(z2 * 0.5 + 0.5, 0.6);
    float da = length(z - a);
    float db = length(z - b);
    float glow = exp(-da * da / 0.004) + exp(-db * db / 0.004);
    finish(c * 1.1 + vec3(1.0, 0.9, 0.7) * glow * 0.3);
}
