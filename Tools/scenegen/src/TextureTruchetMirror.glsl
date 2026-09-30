//@doc
 * @brief TEXTURE TRUCHET MIRROR: quarter-circle Truchet tiles whose arcs are
 * mirrors -- each tile holds two arcs, and the bands between the arcs
 * show the photograph reflected back and forth across them, so the
 * picture folds into endless meandering ribbons of mirrored image; tiles
 * turn slowly (cross-faded, never jumping), re-routing the ribbons, and
 * the arc mirrors gleam.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the tiles re-route and the photo streams (integrated, jump-free)
 *   audioSpread     -> ribbon width
 *   audioKick       -> the mirror arcs gleam (light)
 *   audioMode       -> the tint: cool in minor, warm in major
 *   audioPhase      -> the field turns (integrated)
 *   audioSwell      -> the glow between the ribbons (slow)
 *
 * Knobs: tileP (tile size), mirrorP (mirror sharpness), photoZoomP, hueP.
//@params tileP mirrorP photoZoomP
//@audio audioSpread audioKick audioMode audioPhase audioSwell
//@body
// The Truchet pattern for orientation o (0/1): distance to the nearest arc and the along-arc coordinate.
vec2 truchet(vec2 f, float o)
{
    vec2 q = o > 0.5 ? vec2(1.0 - f.x, f.y) : f;
    float d1 = abs(length(q) - 0.5);
    float d2 = abs(length(q - 1.0) - 0.5);
    float a1 = atan(q.y, q.x), a2 = atan(q.y - 1.0, q.x - 1.0);
    return d1 < d2 ? vec2(d1, a1) : vec2(d2, a2 + 3.14159);
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float S = 3.0 + 4.0 * (1.0 - clamp(tileP, 0.0, 1.0));
    vec2 g = rot2(0.01 * sceneTime + 0.1 * audioPhase) * p * S;
    vec2 gi = floor(g), f = fract(g);
    float T = 0.1 * sceneTime + 0.7 * audioAdvance;
    // Orientation cross-fade per tile.
    float wv = sin(T + hash21(gi) * 6.28 + dot(gi, vec2(0.3, 0.2)));
    float o = smoothstep(-0.25, 0.25, wv);
    vec2 A = truchet(f, 0.0), B = truchet(f, 1.0);
    float width = 0.18 + 0.2 * clamp(audioSpread, 0.0, 1.0);
    // The ribbon coordinate: distance from the arc (across) mirrored into the band.
    float z = 0.25 + 0.35 * clamp(photoZoomP, 0.0, 1.0);
    vec2 win = vec2(0.5) + 0.25 * vec2(sin(T * 0.3), cos(T * 0.23));
    vec3 cA = imgLod(win + vec2(abs(A.x) / width, A.y / 3.14159 + T * 0.1) * z, 0.8);
    vec3 cB = imgLod(win + vec2(abs(B.x) / width, B.y / 3.14159 + T * 0.1) * z, 0.8);
    vec3 col = mix(cA, cB, o);
    float d = mix(A.x, B.x, o);
    vec3 tint = mix(vec3(0.85, 0.95, 1.1), vec3(1.1, 0.95, 0.8), mode);
    col *= tint * (0.6 + 0.6 * smoothstep(width, 0.0, d));
    // Between the ribbons: a dark glowing gap.
    float gapM = smoothstep(width, width + 0.05, d);
    vec3 gc = glowColour(col, gi * 0.1, hueP * 0.159);
    col = mix(col, gc * (0.03 + 0.2 * swell), gapM);
    // The mirror arcs gleam along their centre lines.
    float px = fwidth(g.x) * 1.2;
    float sharp = 0.5 + 1.5 * clamp(mirrorP, 0.0, 1.0);
    col += vec3(1.0) * exp(-d / (px * sharp + 0.004)) * (0.2 + 0.8 * kick);
    finish(col);
}
