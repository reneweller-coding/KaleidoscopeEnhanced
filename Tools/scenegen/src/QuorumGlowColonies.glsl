//@doc
 * @brief QUORUM GLOW COLONIES: a plate of bacterial colonies that only light up once they are dense enough: waves of
 * glow jump from colony to colony across the plate, each colony switching on whole as the wave reaches it, the sparse
 * ones staying dark until the music swells and the threshold drops.  The colonies are the cells of a jittered Voronoi
 * pattern, each a soft blob of fine grain with its own density; the waves spread in rings from a wandering source, and
 * a colony's turn comes when the ring reaches its centre -- so the light jumps from colony to colony instead of
 * sweeping smoothly.  The light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the quorum threshold: as the music swells, sparser colonies join in
 *   audioAdvance -> the waves spread and their source wanders (integrated)
 *
 * Knobs: colonyP (the colonies' size), waveP (how often the waves come), hueP.
//@params colonyP waveP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float S = 0.12 + 0.08 * clamp(colonyP, 0.0, 1.0);
    float run = 0.1 * sceneTime + 0.4 * audioAdvance;
    float often = 0.6 + 0.8 * clamp(waveP, 0.0, 1.0);
    float thr = 0.8 - 0.55 * clamp(audioSwell, 0.0, 1.0);
    vec2 g = p / S, gi = floor(g);
    float d1 = 9.0, d2 = 9.0;
    vec2 best = vec2(0.0), bs = vec2(0.0);
    for (int k = 0; k < 9; ++k) {
        vec2 cell = gi + vec2(float(k % 3) - 1.0, float(k / 3) - 1.0);
        vec2 site = cell + 0.2 + 0.6 * hash22(cell);
        float dd = length(g - site);
        if (dd < d1) { d2 = d1; d1 = dd; best = cell; bs = site; }
        else if (dd < d2) d2 = dd;
    }
    float hc = hash21(best);
    float dens = 0.25 + 0.75 * hc + 0.1 * sin(0.3 * run + 6.0 * hc);
    // the colony: a soft blob of grain inside its cell
    float blob = smoothstep(0.48, 0.3, d1) * smoothstep(0.0, 0.12, d2 - d1);
    float grain = 0.6 + 0.4 * noise2(p * 140.0 + 7.0 * hc);
    // the wave: rings spreading from a wandering source; the colony switches on when the ring reaches its centre
    vec2 src = vec2(0.6 * sin(0.37 * run), 0.3 * cos(0.29 * run));
    float dist = length(bs * S - src);
    float ph = fract(often * run - 1.6 * dist);
    float wave = smoothstep(0.0, 0.04, ph) * (1.0 - smoothstep(0.2, 0.55, ph));
    float quorum = smoothstep(thr - 0.05, thr + 0.05, dens);
    float lit = quorum * (0.25 + 1.4 * wave);
    vec3 col = famCol(fh, 0.45) * 0.015;
    col += famCol(fh, 0.3 + 0.4 * hc) * blob * grain * 0.07;
    col += famLight(fh, 0.3 + 0.4 * hc, 0.3 + 0.5 * wave) * blob * grain * lit;
    finish(col);
}
