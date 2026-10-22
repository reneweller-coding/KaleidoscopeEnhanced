//@doc
 * @brief CHERENKOV RING DETECTOR: inside a detector whose wall is covered with round photomultiplier tubes, packed
 * close: particles crossing the water leave cones of light, and on the wall rings of tubes glow up softly and fade.
 * Each ring is a circle on the wall -- its centre where the particle aims, its radius set by the cone's angle -- and
 * every tube near the circle lights, gently rising and falling, never flashing.  Several rings live at once at
 * different stages.  The tubes' glow is shades of one colour family from the photo; the tube faces are faintly
 * visible as dark glass.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance   -> the clock of crossings (integrated): with more drive, rings follow faster
 *   audioOnset     -> the rings' brightness (they swell softly with the onsets)
 *   audioSwell     -> the rings' width: loud passages light broader bands of tubes
 *
 * Knobs: tubeP (the tubes' size), ringP (how many rings live at once), hueP.  Distinct from the Cherenkov scenes,
 * which show showers.
//@params tubeP ringP
//@audio audioOnset audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float T = 0.035 + 0.02 * clamp(tubeP, 0.0, 1.0);            // the tubes' spacing
    float live = 3.0 + 3.0 * clamp(ringP, 0.0, 1.0);
    float clock = 0.25 * sceneTime + 0.8 * audioAdvance;
    float bright = 0.7 + 0.7 * clamp(audioOnset, 0.0, 1.0);
    // the tube: the nearest centre on a hexagonal lattice
    vec2 r = vec2(1.0, 1.7320508);
    vec2 g = p / T;
    vec2 a = mod(g, r) - 0.5 * r, b = mod(g - 0.5 * r, r) - 0.5 * r;
    vec2 q = dot(a, a) < dot(b, b) ? a : b;
    vec2 tc = (g - q) * T;                                      // the tube's centre
    float face = length(q);
    vec3 col = famCol(fh, 0.45) * 0.03 * smoothstep(0.48, 0.4, face);
    float lit = 0.0;
    for (int k = 0; k < 6; ++k) {
        float fk = float(k);
        if (fk >= live) break;
        // ring k: born at clock steps, each with its own centre; its brightness rises and falls over its life
        float slot = floor(clock / live * 2.0 - fk / live * 2.0);
        float life = fract(clock / live * 2.0 - fk / live * 2.0);
        float hs = fract(sin((slot * 7.0 + fk) * 12.9898) * 43758.5453);
        vec2 c = vec2(1.4 * (hs - 0.5), 0.8 * (fract(hs * 7.3) - 0.5));
        float R = 0.12 + 0.24 * fract(hs * 3.1);
        float env = sin(3.14159265 * life);
        env *= env;
        float d = abs(length(tc - c) - R);
        lit += exp(-pow(d / ((0.5 + 0.5 * clamp(audioSwell, 0.0, 1.0)) * T), 2.0)) * env;
    }
    col += famLight(fh, 0.5, 0.3 * min(lit, 1.0)) * min(lit, 1.5) * smoothstep(0.48, 0.3, face) * bright;
    finish(famExpose(col, 2.10, 0.70, 0.03, fh));
}
