//@doc
 * @brief HANBURY BROWN TWISS BUNCHING: photon bunching: thermal light clumps in pairs, and a correlation picture shows where points fall together; the picture is a field of speckles that close into heaps and open again.  The intensity is the square of the sum of ten waves with random directions and phases that drift,
 * which gives the grainy pattern of speckle; its grain is the coherence length; the photo gives the intensity.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread  -> the coherence length (the grain size) (smoothed)
 *   audioAdvance -> the phases drift (integrated)
 *
 * Knobs: sizeP (the base grain size), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float kmag = 55.0 + 60.0 * (1.0 - clamp(sizeP, 0.0, 1.0)) - 20.0 * clamp(audioSpread, 0.0, 1.0);
    float t = 0.03 * audioAdvance + 0.05 * sceneTime;
    float re = 0.0;
    float im = 0.0;
    for (int k = 0; k < 10; ++k) {
        float fk = float(k);
        vec2 h = hash22(vec2(fk, 11.0));
        float a = 6.2831853 * h.x;
        float km = kmag * (0.8 + 0.4 * h.y);
        float ph = km * (p.x * cos(a) + p.y * sin(a)) + 6.2831853 * hash21(vec2(fk, 5.0)) + t * (1.0 + 2.0 * h.y);
        re += cos(ph);
        im += sin(ph);
    }
    float I = (re * re + im * im) / 10.0;
    vec3 c = imgLod(p * 0.85 + 0.5, 0.8);
    c = mix(vec3(luma(c)), c, 1.3);
    float sp = 1.0 - exp(-I * 0.9);
    vec3 col = c * (0.08 + 1.5 * sp * (0.5 + 0.7 * luma(c))) + vec3(0.9, 0.95, 1.0) * pow(sp, 6.0) * 0.4;
    finish(col);
}
