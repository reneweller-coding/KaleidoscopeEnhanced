//@doc
 * @brief PIANO STRING HAMMER WAVES: the piano string: the hammer strikes at a fraction of the string's length and wakes a mixture of overtones that run as a wave train; sixty strings run in parallel through the photo, each with its own striking place.  The photo is drawn along with each string's
 * displacement, and the string itself shines as a thin bright line in the photo's colour.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the striking place glides (integrated)
 *   audioSwell       -> the amplitude of the strings
 *
 * Knobs: sizeP (the number of strings), hueP.
//@params sizeP
//@audio audioSwell audioHarmAdvance
//@body
/**  The shape of a plucked string: a sum of seven harmonics with the hammer's weights.
 *
 * @param x  The place on the string 0..1. (in)
 * @param a  The striking place 0..1. (in)
 * @param t  The time. (in)
 *
 * @return
 *   The displacement.
 **/
float strg(float x, float a, float t)
{
    float s = 0.0;
    for (int n = 1; n <= 7; ++n) {
        float fn = float(n);
        s += sin(3.1415927 * fn * a) / (fn * fn) * sin(3.1415927 * fn * x) * cos(fn * (1.2 + 0.07 * fn) * t);
    }
    return s;
}
void main()
{
    vec2 q = gl_FragCoord.xy / resolution;
    float N = 30.0 + 40.0 * clamp(sizeP, 0.0, 1.0);
    float row = floor(q.y * N);
    float fy = fract(q.y * N);
    float a = 0.12 + 0.3 * (0.5 + 0.5 * sin(0.1 * audioHarmAdvance + 0.7 * row + 0.03 * sceneTime));
    float amp = 0.5 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    float t = 0.4 * sceneTime + 0.5 * row;
    float s = strg(q.x, a, t) * amp;
    float yy = 0.5 + 0.45 * s * 2.0;
    float d = abs(fy - yy);
    float line = 1.0 - smoothstep(0.03, 0.1, d);
    vec2 p = vec2((q.x - 0.5) * resolution.x / resolution.y, q.y - 0.5 + 0.03 * s * amp);
    vec3 c = imgLod(p * 0.85 + 0.5, 0.6);
    float body = 0.35 + 0.35 * (1.0 - abs(2.0 * fy - 1.0));
    vec3 col = c * body + c * line * 1.3;
    finish(col * 1.1);
}
