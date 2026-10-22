//@doc
 * @brief SEA GLASS TUMBLER: frosted pieces of sea glass tumble slowly before a bright backlight; where they overlap
 * their colours mix like filters, the frosted surfaces glow soft and grainy, their thin edges brighter.  Each piece is a
 * rounded, irregular pebble outline (a circle with a few slow wobbles) that turns and tips -- squeezed along its turning
 * axis as it tips -- and filters the light by its thickness, so overlaps multiply.  The pieces' colours come from the
 * photo, frosted toward white, in one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the pieces tumble and drift (integrated)
 *   audioOnset   -> pieces light up in turn (the light only)
 *   audioSwell   -> the backlight's strength
 *
 * Knobs: pieceP (how many pieces), sizeP (their size), hueP.
//@params pieceP sizeP
//@audio audioOnset audioSwell
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

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float N = floor(14.0 + 10.0 * clamp(pieceP, 0.0, 1.0));
    float sz = 0.16 + 0.1 * clamp(sizeP, 0.0, 1.0);
    float run = 0.03 * sceneTime + 0.12 * audioAdvance;
    float onset = clamp(audioOnset, 0.0, 1.0);
    vec3 back = mix(vec3(1.0, 0.96, 0.9), tone(imgLod(p * 0.5 + 0.5, 5.0), fh) * 1.2, 0.2);
    back *= (0.65 + 0.5 * clamp(audioSwell, 0.0, 1.0)) * (0.75 + 0.35 * exp(-dot(p, p)));
    vec3 trans = vec3(1.0);
    vec3 glow = vec3(0.0);
    for (int i = 0; i < 24; ++i) {
        float fi = float(i);
        if (fi >= N) break;
        float h1 = fract(sin(fi * 12.9898) * 43758.5453), h2 = fract(sin(fi * 78.233) * 43758.5453);
        float h3 = fract(sin(fi * 37.719) * 43758.5453);
        vec2 c = vec2(0.95 * sin(run * (0.3 + 0.2 * h1) + 6.2831853 * h2), 0.55 * sin(run * (0.25 + 0.2 * h2) + 6.2831853 * h3));
        float spin = run * (0.6 + 0.8 * h3) * (h1 < 0.5 ? 1.0 : -1.0) + 6.2831853 * h1;
        float tip = 0.55 + 0.45 * cos(run * (0.5 + 0.5 * h2) + 6.2831853 * h3);   // tipping: squeezed along one axis
        vec2 d = rot2(spin) * (p - c);
        d.x /= max(tip, 0.15);
        float r = length(d), an = atan(d.y, d.x);
        float R = sz * (0.7 + 0.6 * h2) * (1.0 + 0.12 * sin(3.0 * an + 6.2831853 * h1) + 0.07 * sin(5.0 * an + 6.2831853 * h3));
        float x = r / R;
        if (x >= 1.0) continue;
        float inside = smoothstep(1.0, 0.94, x);
        float thick = sqrt(1.0 - x * x) * (0.6 + 0.4 * tip);
        vec3 gc = mix(famCol(fh, h1), tone(imgLod(c * 0.5 + 0.5, 4.0), fh), 0.4);
        vec3 frost = mix(gc, vec3(1.0), 0.35);
        trans *= mix(vec3(1.0), gc / max(max(gc.r, gc.g), max(gc.b, 0.05)) * 0.85, inside * (0.5 + 0.5 * thick));
        float grain = noise2(d * 90.0 / sz + 7.0 * h1);
        float lit = pow(0.5 + 0.5 * cos(6.2831853 * (h3 + 0.1 * audioAdvance)), 6.0) * onset;
        glow += frost * inside * (0.35 * smoothstep(0.75, 1.0, x) + 0.08 * grain + 0.6 * lit);
    }
    vec3 col = back * trans + glow * back * 0.6;
    finish(col);
}
