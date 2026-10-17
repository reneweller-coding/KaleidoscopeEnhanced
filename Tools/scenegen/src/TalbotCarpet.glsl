//@doc
 * @brief TALBOT CARPET: the quantum carpet -- light behind a grating repeats itself at the Talbot distance, and in
 * between it forms images of the grating at every rational fraction, halved, thirded, shifted: a fractal weave of
 * ever finer copies.  The carpet rolls past endlessly (it is periodic in the propagation direction), mirrored about
 * the centre; its brightness lays bare the photo, its phase tints it.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the carpet rolls (integrated)
 *   audioSectionId  -> each section changes the slit width (the carpet's character; crossfaded over four seconds)
 *   audioKick       -> the brightest knots flash (light)
 *
 * Knobs: periodP (grating periods across the frame), slitP (the first slit width), photoP (photo share), hueP.
//@params periodP slitP photoP
//@audio audioKick audioSectionId audioSectionAge
//@body
/**  The carpet's complex amplitude: the grating's Fourier series propagated (Fresnel), 25 orders.
 *
 * @param x  The transverse coordinate, in grating periods. (in)
 * @param z  The propagation distance, in Talbot lengths. (in)
 * @param w  The slit width, a fraction of the period. (in)
 *
 * @return
 *   The complex amplitude.
 **/
vec2 carpet(float x, float z, float w)
{
    vec2 s = vec2(0.0);
    for (int n = -12; n <= 12; ++n) {
        float fn = float(n);
        float cn = n == 0 ? w : sin(3.14159265 * fn * w) / (3.14159265 * fn);   // a slit of width w
        float ph = 6.2831853 * fn * x - 3.14159265 * fn * fn * z * 2.0;      // Talbot length: z = 1 is one period
        s += cn * vec2(cos(ph), sin(ph));
    }
    return s;
}

void main()
{
    vec2 p = screenP();
    float periods = 3.0 + 5.0 * clamp(periodP, 0.0, 1.0);
    float x = p.x * periods;
    float z = abs(p.y) * 1.2 + 0.03 * sceneTime + 0.004 * audioAdvance;
    float k = floor(clamp(slitP, 0.0, 0.999) * 3.0) + max(audioSectionId, 0.0);
    float wNow = 0.12 + 0.08 * mod(k, 3.0), wBefore = 0.12 + 0.08 * mod(k + 2.0, 3.0);
    float m = audioSectionId < 0.5 ? 1.0 : smoothstep(0.0, 4.0, audioSectionAge);
    vec2 a = mix(carpet(x, z, wBefore), carpet(x, z, wNow), m);
    float I = dot(a, a);
    float lit = 1.0 - exp(-I * 6.0);
    float ph = atan(a.y, a.x) / 6.2831853;
    vec2 uv = p * 0.7 + 0.5;
    vec3 photo = imgLod(uv, 0.6);
    vec3 tone = imgPalette(ph + 0.03 * audioPhase);
    vec3 col = mix(tone * 1.2, photo * 1.4, 0.35 + 0.5 * clamp(photoP, 0.0, 1.0)) * lit + photo * 0.05;
    col += mix(tone, vec3(1.0), 0.6) * smoothstep(0.85, 1.0, lit) * 0.25 * (0.5 + clamp(audioKick, 0.0, 1.0));
    finish(col);
}
