//@doc
 * @brief RIBBED GLASS LIGHT ORGAN: a light organ behind a pane of ribbed glass: coloured lamps glow up softly, one per
 * band of the music, and the glass breaks each into narrow streaks of caustic light that overlap where lamps stand
 * close.  Every vertical rib is a little cylinder lens: across the rib the point seen behind the glass is pulled
 * toward the rib's middle and magnified, so a round lamp becomes a column of bright slivers, sharpest where the
 * rib focuses.  The lamps' colours are shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpectrum[32] -> each lamp listens to its own band (the analyzer's envelopes: the lamps glow up and fade)
 *   audioAdvance      -> the lamps drift slowly behind the glass (integrated)
 *
 * Knobs: ribP (how many ribs), lampP (the lamps' size), hueP.  Distinct from the spectrum displays: no bars, only
 * light.
//@params ribP lampP
//@audio audioSpectrum[32]
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float ribs = floor(18.0 + 30.0 * clamp(ribP, 0.0, 1.0));
    float size = 0.12 + 0.12 * clamp(lampP, 0.0, 1.0);
    float drift = 0.02 * sceneTime + 0.08 * audioAdvance;
    // the rib: across it, the seen point is pulled toward the rib's middle (a cylinder lens)
    float u = (p.x + 0.9) * ribs / 1.8;
    float k = floor(u);
    float f = fract(u) - 0.5;
    float seenX = (k + 0.5 + f * 0.35) / ribs * 1.8 - 0.9;
    float focus = 1.0 + 1.6 * exp(-pow(f / 0.18, 2.0));        // the bright sliver at the rib's middle
    vec3 col = vec3(0.0);
    for (int i = 0; i < 8; ++i) {
        float fi = float(i);
        vec2 at = vec2(-0.75 + 0.214 * fi + 0.08 * sin(drift + 1.7 * fi), 0.25 * sin(0.7 * drift + 2.3 * fi));
        float lvl = clamp(audioSpectrum[3 + 3 * i], 0.0, 1.0);
        float d = length(vec2(seenX - at.x, p.y - at.y)) / size;
        float glow = exp(-d * d * 1.5) * (0.15 + 1.2 * lvl);
        col += famLight(fh, fi / 7.0, 0.3 * lvl) * glow;
    }
    col *= focus * 0.6;
    // the ribs' edges: thin dark lines where the glass turns
    col *= smoothstep(0.5, 0.44, abs(f)) * 0.85 + 0.15;
    col += famCol(fh, 0.4) * 0.02;
    finish(col);
}
