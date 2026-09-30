//@doc
 * @brief TEXTURE STAINED GLASS FIELD: an endless wall of stained glass lit
 * from behind -- the photograph is cut into glass pieces of irregular,
 * slightly curved shapes, each piece a single deep jewel colour taken from
 * the photo at that place, joined by dark lead cames; the light behind the
 * glass moves slowly, so pieces brighten and dim in drifting waves, and
 * the glass itself has ripples and seeds that make the light sparkle.  The
 * pieces recut themselves slowly (the leading wanders).  Endless and
 * mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the light behind drifts (integrated, jump-free)
 *   audioSpread     -> piece size (wide spectrum = smaller pieces)
 *   audioRoughness  -> the glass ripples more
 *   audioMode       -> the light warms in major
 *   audioBass       -> the light's strength (light)
 *   audioHigh       -> seeds in the glass sparkle (light)
 *
 * Knobs: sizeP (piece size), leadP (lead width), saturateP (colour depth), hueP.
//@params sizeP leadP saturateP
//@audio audioSpread audioRoughness audioMode audioBass audioHigh
//@body
void main()
{
    vec2 p = screenP();
    float bass = clamp(audioBass, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float sc = (4.0 + 5.0 * clamp(sizeP, 0.0, 1.0)) * (0.8 + 0.5 * clamp(audioSpread, 0.0, 1.0));
    vec2 q = p * sc;
    q += 0.25 * vec2(fbm3(q * 0.3 + 0.01 * sceneTime), fbm3(q * 0.3 + 5.0 - 0.01 * sceneTime));   // curved pieces
    // Voronoi pieces: nearest and second-nearest centres.
    vec2 gi = floor(q), gf = fract(q);
    float f1 = 9.0, f2 = 9.0; vec2 id = vec2(0.0), c1 = vec2(0.0);
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 o = vec2(i, j);
        vec2 c = o + 0.5 + 0.4 * sin(0.03 * sceneTime + 6.28 * hash22(gi + o));
        float d = length(gf - c);
        if (d < f1) { f2 = f1; f1 = d; id = gi + o; c1 = c; } else if (d < f2) f2 = d;
    }
    float border = f2 - f1;
    // The piece's colour: the photo at the piece's centre, made into deep glass.
    vec2 cuv = (gi + c1) / sc * 0.7 + 0.5;
    vec3 ph = imgLod(cuv, 4.0);
    vec3 glass = hsv2rgb(vec3(fract((satOf(ph) > 0.15 ? hue_of(ph) : fract(hueP * 0.159 + hash21(id) * 0.6)) + 0.3 * (hash21(id + 4.0) - 0.5)), 0.75 + 0.2 * clamp(saturateP, 0.0, 1.0), 1.0));
    glass = mix(glass, glass * glass, 0.5 * clamp(saturateP, 0.0, 1.0));
    glass *= 0.6 + 0.6 * luma(ph);
    // Backlight: drifting brightness waves, warm or cool.
    float light = 0.45 + 0.55 * fbm3(p * 1.2 + vec2(0.06 * sceneTime + 0.6 * audioAdvance, 0.0));
    vec3 lightC = mix(vec3(0.9, 0.95, 1.1), vec3(1.15, 1.0, 0.8), clamp(audioMode, 0.0, 1.0)) * (0.7 + 0.6 * bass);
    // Glass texture: ripples and seeds.
    float ripple = 0.85 + 0.15 * noise2(q * (4.0 + 4.0 * rough) + id);
    vec2 sq = q * 9.0, si = floor(sq);
    float seed = step(0.93, hash21(si)) * smoothstep(0.3, 0.0, length(fract(sq) - 0.5));
    vec3 col = glass * lightC * light * ripple * 1.5;
    col += vec3(1.0) * seed * light * (0.2 + 0.9 * hi);
    // Lead cames: dark, slightly rounded, a faint highlight.
    float lw = 0.04 + 0.06 * clamp(leadP, 0.0, 1.0);
    float px = sc / resolution.y * 1.5;
    float lead = smoothstep(lw + px, lw - px, border);
    vec3 leadC = vec3(0.04, 0.04, 0.045) + vec3(0.12) * smoothstep(lw, 0.0, abs(border - lw * 0.5)) * 0.3;
    col = mix(col, leadC, lead);
    // Glow bleeding past the lead into the room.
    col += glass * lightC * light * 0.08;
    finish(col);
}
