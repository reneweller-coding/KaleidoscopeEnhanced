//@doc
 * @brief TWIN HELIX TUNNEL: flying down a tunnel wound from two bands of the
 * photograph -- two broad ribbons spiral along the wall in opposite senses,
 * crossing over and under each other, each carrying the photo along its
 * length; in the diamond-shaped gaps between them glows light from behind
 * the wall, and bright seams run along the ribbon edges.  An endless polar
 * field like Tunnel, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flight (integrated, jump-free)
 *   audioPhase      -> the ribbons turn against each other (integrated)
 *   audioSpread     -> throat depth
 *   audioMode       -> the light in the gaps: cool in minor, warm in major
 *   audioBass       -> the light in the gaps (light)
 *   audioHigh       -> the edge seams glint (light)
 *
 * Knobs: pitchP (winding pitch), widthP (ribbon width), photoP, hueP.
//@params pitchP widthP photoP
//@audio audioPhase audioSpread audioMode audioBass audioHigh
//@body
void main()
{
    vec2 p = screenP() * 3.0;
    float bass = clamp(audioBass, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float r = length(p);
    float a = atan(p.y, p.x);
    float throat = 0.5 * (0.8 + 0.4 * clamp(audioSpread, 0.0, 1.0));
    float z = throat / max(r, 1e-3);
    float u = z + 0.35 * sceneTime + 1.5 * audioAdvance;
    float pitch = 1.0 + 1.5 * clamp(pitchP, 0.0, 1.0);
    float w = 0.28 + 0.15 * clamp(widthP, 0.0, 1.0);
    float turn = 0.03 * sceneTime + 0.3 * audioPhase;
    // Two ribbons: coordinate along each helix (s) and across it (t).
    // With 2 starts each, the angle wrap moves t by an integer: seamless.
    float t1 = a / 6.2831853 * 6.0 - u * pitch * 1.5 + turn;
    float t2 = a / 6.2831853 * 6.0 + u * pitch * 1.5 - turn;
    float d1 = abs(fract(t1) - 0.5), d2 = abs(fract(t2) - 0.5);
    float da = length(fwidth(vec2(cos(a), sin(a))));          // angle cut safe
    float fw = max(da * 6.0 / 6.2831853 + fwidth(u) * pitch * 1.5, 0.002) * 1.5;
    float in1 = smoothstep(w + fw, w - fw, d1);
    float in2 = smoothstep(w + fw, w - fw, d2);
    // Over/under: alternate at each crossing (checkerboard of crossings).
    float cr = mod(floor(t1 + 0.5) + floor(t2 + 0.5), 2.0);   // (t jumps by 6 at the cut: parity unchanged)
    float lod = clamp(log2(max(fwidth(u) * 1024.0 * 0.4, 1.0)), 0.0, 8.0);
    vec3 r1 = imgLod(vec2(t1 * 0.3, u * 0.2), lod);
    vec3 r2 = imgLod(vec2(t2 * 0.3 + 0.5, u * 0.2 + 0.3), lod);
    float photo = 0.6 + 0.4 * clamp(photoP, 0.0, 1.0);
    vec3 tint1 = glowColour(r1, vec2(cos(a), sin(a)), hueP * 0.159);
    vec3 tint2 = glowColour(r2, vec2(sin(a), cos(a)) + 1.0, hueP * 0.159 + 0.3);
    r1 = mix(tint1 * 0.6, r1, photo) * (0.5 + 0.5 * (1.0 - d1 / w));
    r2 = mix(tint2 * 0.6, r2, photo) * (0.5 + 0.5 * (1.0 - d2 / w));
    // Light glowing through the gaps.
    vec3 gapC = mix(vec3(0.3, 0.6, 1.0), vec3(1.0, 0.6, 0.3), clamp(audioMode, 0.0, 1.0)) * (0.35 + 0.9 * bass);
    vec3 col = gapC * (0.5 + 0.5 * noise2(vec2(a * 3.0, u)));
    if (cr > 0.5) { col = mix(col, r2, in2); col = mix(col, r1 * (1.0 - 0.4 * in2), in1); }
    else          { col = mix(col, r1, in1); col = mix(col, r2 * (1.0 - 0.4 * in1), in2); }
    // Edge seams.
    col += vec3(1.0, 0.95, 0.85) * (smoothstep(fw * 2.0, 0.0, abs(d1 - w)) + smoothstep(fw * 2.0, 0.0, abs(d2 - w))) * (0.15 + 0.6 * hi);
    // Depth: far end glows.
    col = mix(col, gapC * 0.6, smoothstep(2.0, 8.0, z));
    col += gapC * exp(-r * 2.5) * 0.5;
    finish(col);
}
