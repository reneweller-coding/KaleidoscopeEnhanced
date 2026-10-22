//@doc
 * @brief BOKEH SPHERE GALAXY: a spiral galaxy made of large round bokeh discs: two arms of light, tilted toward the
 * eye, turning -- the inner stars faster than the outer -- while the plane of focus wanders through it, so discs
 * shrink to sharp points and swell into soft circles again as the focus passes.  Each star sits on a logarithmic
 * arm with its own scatter, is projected in perspective and drawn as a disc whose size is the lens' circle of
 * confusion for its depth, with a slightly brighter rim as real bokeh has.  The stars' colours are shades of one
 * colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos -> the plane of focus sweeps through the galaxy and back over each phrase (smooth)
 *   audioAdvance   -> the galaxy turns (integrated; the inner stars turn faster)
 *   audioSwell     -> the stars' light
 *
 * Knobs: starP (how many stars), apertureP (how large the bokeh grows), hueP.
//@params starP apertureP
//@audio audioPhrasePos audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float N = floor(120.0 + 120.0 * clamp(starP, 0.0, 1.0));
    float ap = 0.04 + 0.06 * clamp(apertureP, 0.0, 1.0);
    float focus = mix(1.4, 3.2, 0.5 - 0.5 * cos(6.2831853 * audioPhrasePos));
    float turn = 0.05 * sceneTime + 0.2 * audioAdvance;
    float bright = 0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = famCol(fh, 0.45) * 0.015;
    for (int i = 0; i < 240; ++i) {
        float fi = float(i);
        if (fi >= N) break;
        float h1 = fract(sin(fi * 12.9898) * 43758.5453), h2 = fract(sin(fi * 78.233) * 43758.5453);
        float h3 = fract(sin(fi * 37.719) * 43758.5453);
        float r = 0.15 + 1.3 * h1;
        float arm = floor(h2 * 2.0) * 3.14159265;
        float ang = arm + 1.6 * log(r) + 0.35 * (h3 - 0.5) + turn * (1.2 / (0.4 + r));
        vec3 x = vec3(r * cos(ang), 0.08 * (h2 - 0.5), r * sin(ang));
        x.yz = rot2(1.05) * x.yz;                               // the galaxy's tilt toward the eye
        x.z += 2.3;
        vec2 sp = x.xy / x.z * 1.3;
        float coc = 0.004 + ap * abs(x.z - focus) / x.z;
        float d = length(p - sp);
        float disc = smoothstep(coc, coc * 0.85, d);
        float rim = exp(-pow((d - coc * 0.92) / (coc * 0.08), 2.0)) * 0.4;
        float energy = 0.0035 / max(coc * coc * 120.0, 0.0035); // the same light spread over a larger disc
        col += famLight(fh, h3, 0.5 * smoothstep(0.01, 0.0, coc - 0.004)) * (disc + rim) * energy * bright * 1.6;
    }
    // the galaxy's core
    col += famLight(fh, 0.5, 0.7) * exp(-length(p - vec2(0.0, 0.0)) * 8.0) * 0.25;
    finish(famExpose(col, 4.28, 0.70, 0.03, fh));
}
