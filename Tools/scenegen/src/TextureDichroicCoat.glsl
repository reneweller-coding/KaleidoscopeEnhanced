//@doc
 * @brief TEXTURE DICHROIC COAT: dichroic glass -- a sheet of glass coated
 * with thin metal-oxide layers that transmit one colour and reflect its
 * complement: the photograph seen through it takes on the transmitted
 * hue while bright reflected patches flash in the opposite colour, and as
 * the sheet slowly tilts, the pair of colours slides through the spectrum
 * (cyan/red, magenta/green, gold/blue); the glass is cut into fused
 * pieces with polished bevels.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the tilt changes (integrated, jump-free)
 *   audioSpread     -> the colour shift across the sheet
 *   audioKick       -> the reflections flash (light)
 *   audioMode       -> the base pair: cool in minor, warm in major
 *   audioRoughness  -> the coating's crackle texture
 *   audioSwell      -> reflection vs. transmission (slow)
 *
 * Knobs: pieceP (piece size), bevelP (bevel width), photoP (photo through the glass), hueP.
//@params pieceP bevelP photoP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    // Fused pieces: a Voronoi of glass pieces, each with its own tilt.
    float S = 2.5 + 3.0 * (1.0 - clamp(pieceP, 0.0, 1.0));
    vec2 x = p * S;
    vec2 i0 = floor(x), f0 = fract(x);
    float d1 = 9.0, d2 = 9.0; vec2 id = i0;
    for (int y = -1; y <= 1; ++y) for (int xx = -1; xx <= 1; ++xx) {
        vec2 o = vec2(xx, y);
        vec2 c = o + 0.15 + 0.7 * hash22(i0 + o);
        float d = length(f0 - c);
        if (d < d1) { d2 = d1; d1 = d; id = i0 + o; } else if (d < d2) d2 = d;
    }
    float ed = d2 - d1;
    float h = hash21(id);
    float T = 0.05 * sceneTime + 0.35 * audioAdvance;
    // The hue of the transmitted colour: slides with the tilt and across the sheet.
    float hueT = fract(mix(0.5, 0.05, mode) + 0.25 * sin(T + h * 6.28) + (0.1 + 0.3 * clamp(audioSpread, 0.0, 1.0)) * dot(p, vec2(0.5, 0.3)) + hueP * 0.159);
    vec3 trans = hsv2rgb(vec3(hueT, 0.85, 1.0));
    vec3 refl = hsv2rgb(vec3(fract(hueT + 0.5), 0.85, 1.0));
    vec2 uv = p * 0.6 + 0.5;
    vec3 ph = imgLod(uv, 1.0);
    vec3 through = mix(vec3(luma(ph)), ph, 0.5) * trans * (0.5 + 0.9 * clamp(photoP, 0.0, 1.0));
    // Reflection: where the piece faces the light (a moving band per piece).
    float face = 0.5 + 0.5 * sin(T * 2.0 + h * 9.0 + dot(p, vec2(2.0, 1.0)));
    float crackle = 0.85 + 0.15 * noise2(p * (60.0 + 80.0 * rough) + h * 10.0);
    float rw = (0.25 + 0.5 * swell) * pow(face, 3.0) * crackle;
    vec3 col = mix(through, refl * (0.6 + 0.8 * kick), rw);
    // Bevels between the pieces: polished, bright, catching both colours.
    float bw = 0.03 + 0.06 * clamp(bevelP, 0.0, 1.0);
    float px = fwidth(x.x) * 1.2;
    float bevel = smoothstep(bw + px, bw * 0.3, ed);
    col = mix(col, mix(trans, refl, 0.5 + 0.5 * sin(ed / bw * 6.0 + T * 3.0)) * 0.9 + vec3(0.15), bevel * 0.8);
    col *= 1.0 - 0.6 * smoothstep(px * 1.5, 0.0, ed);        // the fused seam itself
    col = mix(col, col * glowColour(ph, p, hueP * 0.159) * 1.2, 0.05);
    finish(col);
}
