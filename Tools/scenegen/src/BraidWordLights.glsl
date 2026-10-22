//@doc
 * @brief BRAID WORD LIGHTS: strands of light braided after a braid word: every step two neighbouring strands cross,
 * one over the other, and the history of crossings runs off into the depth like a plait of light lying on a plane.
 * A strand belongs to a slot; at each step the word picks a pair of neighbouring slots, whose strands swap places in
 * a smooth S-curve, the overcrossing strand drawn over a gap in the under one; strands are shaded by where they run
 * across the plait, so no history has to be kept.  The word is written by the music; the plait runs toward the eye.
 * The strands' light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the plait runs toward the eye (integrated): each stretch of drive writes another crossing
 *   audioSwell   -> the strands' glow
 *
 * Knobs: strandP (how many strands), stepP (how long a step is), hueP.
//@params strandP stepP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float n = floor(4.0 + 3.0 * clamp(strandP, 0.0, 1.0));      // the strands
    float stepL = 0.6 + 0.6 * clamp(stepP, 0.0, 1.0);
    float clock = 0.25 * sceneTime + 1.0 * audioAdvance;
    float glow = 0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    // the plane: depth from the screen's height (horizon above), across from x
    float horizon = 0.42;
    float dz = max(horizon - p.y, 0.001);
    float z = 0.35 / dz;                                         // distance along the plait
    float x = p.x * z * 0.8;                                     // across, in plane units
    float w = clock - z / stepL;                                 // which step (crossing) of the word this is
    float k = floor(w), f = w - k;
    // the word's letter at step k: which neighbouring pair crosses, and which strand is on top
    float hk = fract(sin(k * 12.9898) * 43758.5453);
    float pair = floor(hk * (n - 1.0));
    float over = step(0.5, fract(hk * 7.31));
    vec3 col = vec3(0.0);
    float spacing = 0.35;
    for (int s = 0; s < 7; ++s) {
        float fs = float(s);
        if (fs >= n) break;
        float slot = fs - 0.5 * (n - 1.0);
        float xs = slot * spacing;
        float under = 1.0;
        // a crossing pair: the strand in slot 'pair' moves to pair + 1 and back the other way, in an S-curve
        float sc = smoothstep(0.15, 0.85, f);
        if (fs == pair) { xs += spacing * sc; under = over; }
        else if (fs == pair + 1.0) { xs -= spacing * sc; under = 1.0 - over; }
        float d = abs(x - xs) / z;                               // the distance on screen
        float crossing = (fs == pair || fs == pair + 1.0) ? exp(-pow((f - 0.5) / 0.12, 2.0)) : 0.0;
        float gap = 1.0 - 0.85 * crossing * (1.0 - under);       // the under strand dims where the other passes
        float g = exp(-pow(d / (0.006 / z + 0.0015), 2.0)) + 0.2 * exp(-d / (0.02 / z + 0.003));
        // shaded by where across the plait it runs (continuous where two strands trade slots)
        col += famLight(fh, 0.2 + 0.6 * (xs / spacing + 0.5 * (n - 1.0)) / max(n - 1.0, 1.0), 0.3) * g * gap * glow;
    }
    col *= smoothstep(0.0, 0.03, dz) * exp(-0.05 * z);
    col += famCol(fh, 0.45) * 0.02;
    finish(col);
}
