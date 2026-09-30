//@doc
 * @brief STELLA PROTRACTORS: Frank Stella's Protractor paintings in motion
 * -- great interlaced half-circles and full circles of bold concentric
 * bands (each band a flat fluorescent colour) overlap and weave over and
 * under each other across the canvas, separated by thin white lines; the
 * arcs slowly rotate around their centres and the colours cycle outward
 * through the bands.  Colours drawn from the photograph.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the colours cycle and the arcs turn (integrated, jump-free)
 *   audioSpread     -> band width
 *   audioKick       -> the colours brighten (light)
 *   audioMode       -> palette: cool fluorescents in minor, warm in major (tint)
 *   audioPhase      -> the whole composition rotates slowly (integrated)
 *   audioSwell      -> the white separating lines (slow)
 *
 * Knobs: arcP (arc size), bandP (bands per arc), photoP (photo colours), hueP.
//@params arcP bandP photoP
//@audio audioSpread audioKick audioMode audioPhase audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec2 q = rot2(0.01 * sceneTime + 0.1 * audioPhase) * p;
    float S = 0.9 + 0.8 * (1.0 - clamp(arcP, 0.0, 1.0));
    vec2 g = q * S;
    vec2 gi = floor(g);
    float T = 0.05 * sceneTime + 0.35 * audioAdvance;
    float nb = 4.0 + 5.0 * clamp(bandP, 0.0, 1.0);
    vec3 col = vec3(0.95, 0.94, 0.9);
    float bestZ = -1.0;
    float fwG = fwidth(g.x);                                    // before the loop (continue below)
    // Arcs centred on the grid vertices; each covers a half or full disc;
    // the one with the highest priority at this crossing lies on top.
    for (int j = 0; j <= 1; ++j) for (int i = 0; i <= 1; ++i) {
        vec2 c = gi + vec2(i, j);
        float h = hash21(c);
        vec2 d = g - c;
        float r = length(d);
        float R = 0.95 + 0.1 * h;
        if (r > R) continue;
        float ang = atan(d.y, d.x) + T * (h - 0.5) * 0.6 + h * 6.28;
        vec2 u = vec2(cos(ang), sin(ang));
        // Half discs (protractors) for some, full for others.
        float half_ = step(0.4, h);
        if (half_ > 0.5 && u.y < 0.0) continue;
        // Interlace: priority alternates with the angle, so arcs weave.
        float z = fract(h * 7.0 + 0.5 * step(0.0, sin(ang * 2.0 + h * 9.0)));
        if (z < bestZ) continue;
        bestZ = z;
        float bw = (0.7 + 0.6 * clamp(audioSpread, 0.0, 1.0));
        float x = r / R * nb * bw - T * 2.0;
        float band = floor(x);
        float fb = fract(x);
        vec3 pc = imgPalette(fract(band * 0.17 + h + hueP * 0.159));
        pc = pc / max(max(pc.r, max(pc.g, pc.b)), 0.2);
        vec3 fluo = hsv2rgb(vec3(fract(band * 0.13 + h * 0.5 + mix(0.55, 0.0, mode)), 0.85, 1.0));
        vec3 bc = mix(fluo, pc, clamp(photoP, 0.0, 1.0) * 0.6);
        float px = fwG / R * nb * bw * 1.2 + 1e-4;
        float white = smoothstep(px * (1.0 + 2.0 * swell), 0.0, min(fb, 1.0 - fb));
        col = mix(bc * (1.0 + 0.3 * kick), vec3(0.97), white * 0.9);
        // Outline of the protractor.
        col = mix(col, vec3(0.97), smoothstep(px * 1.5, 0.0, abs(r - R) / R * nb * bw));
    }
    finish(col);
}
