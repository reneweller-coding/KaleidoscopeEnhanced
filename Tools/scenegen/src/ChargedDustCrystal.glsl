//@doc
 * @brief CHARGED DUST CRYSTAL: a plasma crystal -- charged dust grains, held apart by their repulsion, settle into a
 * hexagonal lattice -- melting and freezing again.  When the plasma heats up, every grain trembles further about its
 * place until the lattice loses its order and the grains wander as a liquid, swapping places; when it cools they
 * fall back into rows.  The frame is filled with the glowing round grains, coloured by the photo where they sit.
 *
 * Audio Reactivity (structure, not only light):
 *   audioArousal    -> the temperature: excited music melts the crystal
 *   audioAdvance    -> the liquid's wandering (integrated)
 *   audioKick       -> the grains flash (light)
 *
 * Knobs: spacingP (the lattice spacing), meltP (the base temperature), photoP (photo share), hueP.
//@params spacingP meltP photoP
//@audio audioArousal audioKick
//@body
void main()
{
    vec2 p = screenP();
    float a = 0.045 + 0.035 * clamp(spacingP, 0.0, 1.0);
    float T = clamp(0.35 * clamp(meltP, 0.0, 1.0) + 0.7 * clamp(audioArousal, 0.0, 1.0) - 0.05, 0.0, 1.0);   // the temperature
    float tw = 0.4 * sceneTime + 1.2 * audioAdvance;            // the grains' own time
    // the hexagonal lattice in skewed coordinates; each grain trembles (and, hot, wanders) about its site
    vec2 sk = vec2(p.x - p.y * 0.57735, p.y * 1.1547) / a;
    vec2 base = floor(sk);
    vec3 tone = imgPalette(0.4 + 0.03 * audioPhase);
    vec3 col = imgLod(p * 0.3 + 0.5, 5.0) * 0.1;
    float glow = 0.0;
    for (int j = -2; j <= 2; ++j) for (int i = -2; i <= 2; ++i) {
        vec2 c = base + vec2(float(i), float(j));
        vec2 site = vec2(c.x + 0.5 * c.y, c.y * 0.8660254) * a;
        vec2 h = hash22(c);
        // the trembling: a smooth random walk whose reach grows with the temperature (up to beyond a neighbour)
        vec2 wob = vec2(noise2(c * 1.7 + vec2(tw * (0.6 + h.x), 3.1)), noise2(c * 1.3 + vec2(7.7, tw * (0.6 + h.y)))) - 0.5;
        vec2 wander = vec2(noise2(c * 0.31 + vec2(tw * 0.11, 1.0)), noise2(c * 0.29 + vec2(5.0, tw * 0.13))) - 0.5;
        vec2 g = site + a * (0.6 * T * wob + 2.6 * T * T * wander);
        float d = length(p - g);
        float r = a * 0.33;
        float core = smoothstep(r, r * 0.4, d);
        glow += exp(-d * d / (a * a * 0.2)) * 0.25;
        if (core > 0.001) {
            vec3 photo = imgLod(site * 0.45 + 0.5, 1.0);
            vec3 cg = mix(tone * 1.3, photo * 1.6, 0.5 + 0.45 * clamp(photoP, 0.0, 1.0)) * (1.0 + 0.5 * clamp(audioKick, 0.0, 1.0));
            col = mix(col, cg * (0.7 + 0.6 * smoothstep(r, 0.0, d)), core);
        }
    }
    col += tone * glow * 0.35;
    finish(col * 1.3);
}
