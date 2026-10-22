//@doc
 * @brief PULSATING AURORA PATCHES: pulsating aurora: soft patches of light scattered over a dark sky, each swelling and
 * fading on its own slow pulse while the whole field drifts as the chords change, over a faint diffuse glow.  The
 * patches are soft blobs in the cells of a jittered lattice, their outlines rippled by noise; each pulses smoothly at
 * its own rate with the music's drive, never switching.  The light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance     -> the patches pulse (integrated: with the music's tempo, softly)
 *   audioHarmAdvance -> the field drifts with the chords (gliding)
 *   audioSwell       -> the diffuse glow
 *
 * Knobs: patchP (the patches' size), pulseP (how deeply they pulse), hueP.
//@params patchP pulseP
//@audio audioHarmAdvance audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float S = 0.22 + 0.12 * clamp(patchP, 0.0, 1.0);
    float depth = 0.5 + 0.45 * clamp(pulseP, 0.0, 1.0);
    float run = 0.15 * sceneTime + 0.6 * audioAdvance;
    float h = max(audioHarmAdvance, 0.0);
    vec2 drift = vec2(0.2 * sin(0.3 * h) + 0.01 * sceneTime, 0.1 * cos(0.23 * h));
    vec2 g = (p + drift) / S, gi = floor(g);
    vec3 col = famCol(fh, 0.4) * 0.05 * (0.5 + fbm(1.2 * p + 0.05 * run)) * (0.6 + 0.8 * clamp(audioSwell, 0.0, 1.0));
    for (int k = 0; k < 9; ++k) {
        vec2 cell = gi + vec2(float(k % 3) - 1.0, float(k / 3) - 1.0);
        float h1 = hash21(cell), h2 = hash21(cell + 9.0);
        vec2 c = cell + 0.25 + 0.5 * hash22(cell);
        vec2 d = g - c;
        float an = atan(d.y, d.x);
        float R = (0.3 + 0.18 * h1) * (1.0 + 0.18 * (noise2(vec2(cos(an), sin(an)) * 2.0 + 7.0 * h2 + 0.1 * run) - 0.5));
        float blob = smoothstep(R, R * 0.35, length(d));
        float pulse = 1.0 - depth + depth * smoothstep(0.15, 0.85, 0.5 + 0.5 * sin(run * (0.6 + 0.6 * h2) + 6.2831853 * h1));
        col += famLight(fh, 0.25 + 0.5 * h1, 0.25) * blob * pulse * 0.7;
    }
    finish(col);
}
