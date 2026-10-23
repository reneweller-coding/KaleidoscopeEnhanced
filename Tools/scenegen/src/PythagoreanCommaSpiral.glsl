//@doc
 * @brief PYTHAGOREAN COMMA SPIRAL: the spiral of fifths: twelve pure fifths exceed seven octaves by the Pythagorean comma, so the spiral does not close; the picture shows a spiral of photo strips that does not quite meet itself, and the gap wanders.  The seam where the end misses the beginning
 * is a step of a fraction of a strip, and its size follows the tension of the harmony.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the size of the gap (the comma) swells and fades with the harmony (integrated)
 *   audioAdvance     -> the spiral turns
 *
 * Knobs: sizeP (the width of the strips), hueP.
//@params sizeP
//@audio audioAdvance audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float r = length(p) + 1e-4;
    float th = atan(p.y, p.x);
    float comma = 0.12 + 0.12 * sin(0.15 * audioHarmAdvance + 0.04 * sceneTime);
    float N = 12.0 - 4.0 * clamp(sizeP, 0.0, 1.0);
    float psi = (th / 6.2831853) * (1.0 + comma) - 0.55 * log(r / 0.05) + 0.012 * audioAdvance + 0.01 * sceneTime;
    float m = floor(psi * N);
    float fr = fract(psi * N);
    float line = smoothstep(0.0, 0.07, fr) * (1.0 - smoothstep(0.93, 1.0, fr));
    vec2 sh = 0.012 * m * vec2(cos(0.7 * m), sin(0.7 * m));
    vec3 c = imgLod(rot2(0.04 * m) * p * 0.85 + 0.5 + sh, 0.6);
    float seam = smoothstep(0.0, 0.03, abs(abs(th) - 3.1415927));
    float fade = smoothstep(0.02, 0.07, r);
    finish(c * (0.3 + 0.7 * line) * (0.75 + 0.25 * seam) * fade * 1.2);
}
