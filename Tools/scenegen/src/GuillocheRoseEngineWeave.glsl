//@doc
 * @brief GUILLOCHE ROSE ENGINE WEAVE: the rose engine: two wave discs drive a stylus in curves whose envelope is a weave of rosettes; here the stylus draws lines of the photo's brightness on a plate, and the discs change their wave numbers.  Forty rotated copies of a two-wave closed curve, drawn as fine
 * lines in the colour of the photo, make the weave; two wave sets fade into each other.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the wave numbers glide between two sets (integrated)
 *   audioAdvance     -> the phase of the discs runs on
 *
 * Knobs: sizeP (the line fineness), hueP.
//@params sizeP
//@audio audioAdvance audioHarmAdvance
//@body
float rosette(float r, float th, float k1, float k2, float ph, float a, float b)
{
    float acc = 0.0;
    float lw = 0.0035 + 0.004 * a;
    for (int j = 0; j < 40; ++j) {
        float fj = float(j) / 40.0;
        float rc = 0.08 + 0.95 * fj + (0.05 + 0.06 * fj) * sin(k1 * th + 3.0 * 6.2831853 * fj + ph) + 0.05 * sin(k2 * th - 2.0 * 6.2831853 * fj + 1.3 * ph);
        acc += 1.0 - smoothstep(lw * 0.5, lw * 1.4, abs(r - rc));
    }
    return acc;
}
void main()
{
    vec2 p = screenP();
    float r = length(p);
    float th = atan(p.y, p.x);
    float ph = 0.05 * audioAdvance + 0.04 * sceneTime;
    float e = smoothstep(0.2, 0.8, 0.5 + 0.5 * sin(0.1 * audioHarmAdvance + 0.03 * sceneTime));
    float a = clamp(sizeP, 0.0, 1.0);
    float A = rosette(r, th, 5.0, 8.0, ph, a, 0.0);
    float B = rosette(r, th, 7.0, 11.0, ph, a, 0.0);
    float v = mix(A, B, e);
    vec3 c = imgLod(p * 0.85 + 0.5, 0.8);
    c = mix(vec3(luma(c)), c, 1.4);
    vec3 plate = vec3(0.04, 0.045, 0.06) + imgLod(p * 0.85 + 0.5, 2.5) * 0.05;
    finish(plate + c * clamp(v, 0.0, 2.0) * 0.9 * 1.3);
}
