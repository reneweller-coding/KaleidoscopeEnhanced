//@doc
 * @brief LOTUS LAYER UNFOLD: a mandala that unfolds like a lotus flower: five layers of petals, each with its own
 * number of petals, open one after another from the outside in over each phrase and close again, their edges
 * glowing; the petal count changes with the chords.  A petal is the region in its sector whose half-width swells
 * from the base to the middle and closes at the tip (sin(pi r / R)^0.7); a layer's tip radius grows as it opens; the
 * layers lie over one another, the outer ones behind.  The petals are shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos   -> the layers open one after another over each phrase and close again
 *   audioHarmAdvance -> the number of petals changes with the chords (cross-faded)
 *   audioAdvance     -> the layers turn slowly, each its own way (integrated)
 *   audioSwell       -> the edges' glow
 *
 * Knobs: sizeP (the flower's size), petalP (the base number of petals), hueP.
//@params sizeP petalP
//@audio audioPhrasePos audioHarmAdvance audioSwell
//@body
/**  The photo's colour calmed toward the colour family.
 *
 * @param photo  The photo's colour. (in)
 * @param fh     The family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 tone(vec3 photo, float fh)
{
    float l = luma(photo);
    return mix(photo * 1.1, famCol(fh, 0.15 + 0.7 * l) * (0.25 + 1.2 * l), 0.45);
}

/**  The whole lotus for one base petal count.
 *
 * @param p      The place on screen. (in)
 * @param nb     The base petal count. (in)
 * @param clock  The phrase's clock, 0 closed .. 1 open. (in)
 * @param turn   The layers' turning. (in)
 * @param size   The flower's size. (in)
 * @param glow   The edges' glow. (in)
 * @param fh     The colour family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 lotus(vec2 p, float nb, float clock, float turn, float size, float glow, float fh)
{
    float r = length(p), a0 = atan(p.y, p.x);
    vec3 col = famCol(fh, 0.45) * 0.02 + tone(imgLod(p * 0.4 + 0.5, 5.0), fh) * 0.06;
    for (int k = 0; k < 5; ++k) {                                    // the outer layers first (behind)
        float fk = float(k);
        float n = nb + 2.0 * fk;
        float open = smoothstep(0.1 * fk, 0.1 * fk + 0.5, clock);
        float R = size * (1.25 - 0.2 * fk) * (0.3 + 0.7 * open);
        float sec = 6.2831853 / n;
        float a = mod(a0 + turn * (mod(fk, 2.0) < 0.5 ? 1.0 : -1.0) * (0.5 + 0.2 * fk) + 0.5 * sec * fk, sec) - 0.5 * sec;
        float x = r / R;
        if (x >= 1.0) continue;
        float w = 0.48 * sec * pow(max(sin(3.14159265 * x), 0.0), 0.7);
        float d = (w - abs(a)) * r;                                   // how far inside the petal's edge
        float inside = smoothstep(0.0, 0.004, d);
        vec3 pc = mix(famCol(fh, 0.2 + 0.15 * fk), tone(imgLod(p * 0.6 + 0.5, 2.0), fh), 0.35) * (0.25 + 0.6 * x);
        pc += famLight(fh, 0.6, 0.7) * exp(-pow(d / 0.004, 2.0)) * glow;
        pc += famLight(fh, 0.5, 0.5) * exp(-pow(abs(a) * r / 0.002, 2.0)) * 0.12 * inside;   // the petal's midrib
        col = mix(col, pc, inside * 0.92);
    }
    col += famLight(fh, 0.7, 0.8) * exp(-r * r / 0.003) * 0.8;      // the seed pod
    return col;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float size = 0.65 + 0.25 * clamp(sizeP, 0.0, 1.0);
    float n0 = 5.0 + floor(3.0 * clamp(petalP, 0.0, 1.0));
    float h = max(audioHarmAdvance, 0.0);
    float hk = floor(h), hm = smoothstep(0.15, 0.85, h - hk);
    float nA = n0 + mod(hk, 3.0), nB = n0 + mod(hk + 1.0, 3.0);
    float clock = 0.5 - 0.5 * cos(6.2831853 * clamp(audioPhrasePos, 0.0, 1.0));
    float turn = 0.01 * sceneTime + 0.04 * audioAdvance;
    float glow = 0.4 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = (1.0 - hm) * lotus(p, nA, clock, turn, size, glow, fh) + hm * lotus(p, nB, clock, turn, size, glow, fh);
    finish(col);
}
