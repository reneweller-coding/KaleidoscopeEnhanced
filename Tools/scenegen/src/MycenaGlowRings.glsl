//@doc
 * @brief MYCENA GLOW RINGS: rings of glowing mushrooms on a dark forest floor, abstracted into concentric circles of
 * light that grow outward from several centres and run into one another, brighter where they meet; each phrase a new
 * ring starts at every centre while the oldest fades at the edge.  A ring is a circle of small glowing caps (a fixed
 * number, drawing apart as the ring grows) over a thin line of light; the rings of a centre stand a phrase apart, so a
 * new phrase only moves them all one step on.  Faint mycelium glows between them.  The light is shades of one colour
 * family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos -> the rings grow over each phrase; every phrase a new ring starts at each centre
 *   audioSwell     -> how far the rings have spread (they reach further as the music swells)
 *   audioAdvance   -> the centres drift (integrated)
 *
 * Knobs: ringP (the rings' spacing), capP (how many caps a ring has), hueP.
//@params ringP capP
//@audio audioPhrasePos audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float R0 = 0.16 + 0.1 * clamp(ringP, 0.0, 1.0);
    float caps = floor(36.0 + 28.0 * clamp(capP, 0.0, 1.0));
    float grow = 0.85 + 0.3 * clamp(audioSwell, 0.0, 1.0);
    float drift = 0.02 * sceneTime + 0.08 * audioAdvance;
    float pos = clamp(audioPhrasePos, 0.0, 1.0);
    vec3 col = famCol(fh, 0.45) * 0.03 * smoothstep(0.35, 0.75, fbm(4.0 * p + 0.1 * drift));   // the mycelium
    for (int c = 0; c < 5; ++c) {
        float fc = float(c);
        vec2 ctr = vec2(1.5 * (fract(fc * 0.7548777 + 0.2) - 0.5), 0.8 * (fract(fc * 0.5698403 + 0.6) - 0.5));
        ctr += 0.08 * vec2(sin(drift + 2.0 * fc), cos(0.8 * drift + 3.0 * fc));
        vec2 d = p - ctr;
        float r = length(d), an = atan(d.y, d.x);
        for (int j = 0; j < 4; ++j) {
            float age = pos + float(j);                              // the ring's age in phrases
            float rad = R0 * age * grow;
            float life = smoothstep(0.0, 0.3, age) * (1.0 - smoothstep(2.6, 4.0, age));
            float line = exp(-pow((r - rad) / 0.006, 2.0)) * 0.5;
            float cell = an / 6.2831853 * caps + 0.37 * fc;            // (not by j: j shifts when a phrase ends)
            float ca = (fract(cell) - 0.5) * 6.2831853 / caps * max(rad, 0.01);
            float cap = exp(-(ca * ca + (r - rad) * (r - rad)) / 0.00005);
            col += famLight(fh, 0.3 + 0.1 * fc, 0.3 + 0.4 * cap) * (line + 1.3 * cap) * life;
        }
    }
    finish(col);
}
