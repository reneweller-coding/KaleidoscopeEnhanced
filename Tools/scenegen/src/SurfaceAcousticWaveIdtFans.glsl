//@doc
 * @brief SURFACE ACOUSTIC WAVE IDT FANS: surface waves: interdigital transducers send waves that run as narrow beams with diffraction side lobes over a crystal and are broken at reflector gratings; the picture shows fans of beams in which the photo vibrates as the substrate.  Three transducers at the left edge send
 * beams (a main lobe and side lobes), the photo is displaced by the wave, and reflector stripes stand on the right.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the wavelength glides with the key (integrated)
 *   audioSpread      -> the number of fingers: the beams' narrowness (smoothed)
 *
 * Knobs: sizeP (the amplitude of the vibration), hueP.
//@params sizeP
//@audio audioSpread audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float lam = 0.05 + 0.02 * sin(0.04 * audioHarmAdvance + 0.02 * sceneTime);
    float k = 6.2831853 / lam;
    float fing = 6.0 + 10.0 * clamp(audioSpread, 0.0, 1.0);
    float amp = 0.004 + 0.012 * clamp(sizeP, 0.0, 1.0);
    vec2 disp = vec2(0.0);
    float inten = 0.0;
    for (int j = 0; j < 3; ++j) {
        float fj = float(j);
        vec2 src = vec2(-0.5 * asp * 0.98, (fj - 1.0) * 0.28);
        float ang = 0.18 * (fj - 1.0) + 0.1 * sin(0.03 * sceneTime + fj);
        vec2 ax = vec2(cos(ang), sin(ang));
        vec2 d = p - src;
        float along = dot(d, ax);
        float across = dot(d, vec2(-ax.y, ax.x));
        if (along < 0.0) continue;
        float th = across / (along + 0.05);
        float u = th * fing * 0.9;
        float sinc = abs(u) < 1e-3 ? 1.0 : sin(u) / u;
        float beam = sinc * sinc;
        float w = beam * exp(-along * 0.5);
        float phs = k * along - 3.0 * sceneTime;
        disp += w * cos(phs) * vec2(-ax.y, ax.x) * amp * 8.0 + w * sin(phs) * ax * amp * 3.0;
        inten += w * (0.5 + 0.5 * cos(phs));
    }
    vec2 uv = (p + disp) * 0.85 + 0.5;
    vec3 c = imgLod(uv, 0.6);
    float refl = step(0.88 * 0.5 * asp, p.x) * (0.5 + 0.5 * sin(p.x * 120.0));
    vec3 col = c * (0.7 + 0.5 * inten) + vec3(0.9, 0.8, 0.5) * refl * 0.2;
    float idt = step(p.x, -0.5 * asp * 0.95) * (0.5 + 0.5 * sin(p.y * 90.0));
    col = mix(col, vec3(0.9, 0.8, 0.5), idt * 0.3 * step(abs(fract(p.y * 3.4) - 0.5), 0.3));
    finish(col * 1.1);
}
