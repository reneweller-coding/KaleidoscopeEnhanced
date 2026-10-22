//@doc
 * @brief PALETTE CYCLING RIPPLES: motion made only by cycling colours, as in the pixel art of the nineties: a still image
 * of ripples, a waterfall and a whirl, painted in a few bands of neighbouring tones, comes alive as the palette rotates
 * through it -- rings run outward, water falls, the whirl turns -- mirrored and endless.  The image is a field of
 * indices (concentric ripples from two centres, a falling gradient broken by noise, the angle round a whirl); the
 * colour is the palette entry at the index minus the cycle, cut into a few hard bands.  The palette is a handful of
 * neighbouring tones of the photo's colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the palette cycles (integrated: with the music's tempo)
 *   audioSwell   -> the palette's brightness
 *
 * Knobs: bandsP (how many bands the palette has), scaleP (the image's scale), hueP.
//@params bandsP scaleP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float bands = floor(6.0 + 6.0 * clamp(bandsP, 0.0, 1.0));
    float sc = 0.8 + 0.6 * clamp(scaleP, 0.0, 1.0);
    float cycle = 0.15 * sceneTime + 0.6 * audioAdvance;
    float bright = 0.7 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    // the still image, mirrored so it repeats without seams
    vec2 q = abs(fract(p * sc * 0.5 + 0.5) * 2.0 - 1.0);
    float rip = 0.5 * length(q - vec2(0.2, 0.25)) * 6.0 + 0.5 * length(q - vec2(0.85, 0.7)) * 5.0;
    float fall = q.y * 3.0 + 0.4 * fbm(vec2(q.x * 8.0, q.y));
    vec2 wc = q - vec2(0.7, 0.2);
    float whirl = atan(wc.y, wc.x) / 6.2831853 * 2.0 + length(wc) * 3.0;
    float wFall = smoothstep(0.35, 0.45, q.x) * smoothstep(0.65, 0.55, q.x);
    float wWhirl = smoothstep(0.35, 0.15, length(wc));
    // each part takes its palette entry in hard bands; the parts are blended as colours (never as indices: the
    // whirl's index jumps by whole turns where its angle wraps, which only a colour blend hides)
    float b1 = floor(fract(rip - cycle) * bands) / bands;
    float b2 = floor(fract(fall - cycle) * bands) / bands;
    float b3 = floor(fract(whirl - cycle) * bands) / bands;
    vec3 c1 = famCol(fh, b1) * (0.25 + 0.75 * (0.5 + 0.5 * sin(6.2831853 * b1)));
    vec3 c2 = famCol(fh, b2) * (0.25 + 0.75 * (0.5 + 0.5 * sin(6.2831853 * b2)));
    vec3 c3 = famCol(fh, b3) * (0.25 + 0.75 * (0.5 + 0.5 * sin(6.2831853 * b3)));
    vec3 col = mix(mix(c1, c2, wFall), c3, wWhirl) * bright;
    finish(col);
}
