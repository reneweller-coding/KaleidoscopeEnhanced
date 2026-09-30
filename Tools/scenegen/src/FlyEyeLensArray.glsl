//@doc
 * @brief FLY EYE LENS ARRAY: seeing the photograph through a compound eye --
 * a honeycomb of hundreds of tiny domed lenses, each showing its own
 * small, slightly shifted and flipped image of the scene, so the picture
 * repeats in a mosaic of little worlds; the whole eye slowly scans across
 * the picture, the lenses glinting with highlights and a thin dark rim
 * between them.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the eye scans (integrated, jump-free)
 *   audioSpread     -> how far each lens looks (field of view)
 *   audioKick       -> the lens highlights flash (light)
 *   audioMode       -> the tint: cool in minor, warm in major
 *   audioPhase      -> the array turns (integrated)
 *   audioSwell      -> the lenses' own glow (slow)
 *
 * Knobs: lensP (lens size), flipP (image flip in each lens), rimP (rim width), hueP.
//@params lensP flipP rimP
//@audio audioSpread audioKick audioMode audioPhase audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float S = 8.0 + 12.0 * (1.0 - clamp(lensP, 0.0, 1.0));
    vec2 q = rot2(0.01 * sceneTime + 0.1 * audioPhase) * p * S;
    const vec2 s = vec2(1.0, 1.7320508);
    vec2 a = mod(q, s) - s * 0.5;
    vec2 b = mod(q - s * 0.5, s) - s * 0.5;
    vec2 l = dot(a, a) < dot(b, b) ? a : b;
    vec2 cid = q - l;
    cid = floor(cid / (s * 0.5) + 0.5) * (s * 0.5);
    float T = 0.02 * sceneTime + 0.15 * audioAdvance;
    // Each lens looks at the scene from its own position: centre + local view.
    float fov = 0.08 + 0.15 * clamp(audioSpread, 0.0, 1.0);
    float flip = mix(1.0, -1.0, clamp(flipP, 0.0, 1.0));
    vec2 look = cid / S * 0.5 + 0.5 + vec2(T, 0.4 * T) + l * fov * flip;
    vec3 ph = imgLod(look, 0.6);
    vec3 tint = mix(vec3(0.85, 0.95, 1.1), vec3(1.1, 0.95, 0.8), mode);
    // Dome shading: brighter centre, darker toward the rim.
    float r = length(l) / 0.5;
    vec3 col = ph * tint * (1.05 - 0.45 * r * r);
    col += glowColour(ph, cid * 0.1, hueP * 0.159) * (0.03 + 0.1 * swell) * (1.0 - r);
    // Highlight on each dome.
    float hl = smoothstep(0.25, 0.05, length(l - vec2(-0.14, 0.14)));
    col += vec3(1.0) * hl * (0.15 + 0.6 * kick);
    // Rims.
    float hexD = max(abs(l.x), abs(l.x) * 0.5 + abs(l.y) * 0.866);
    float px = fwidth(q.x) * 1.2;
    float rw = 0.02 + 0.05 * clamp(rimP, 0.0, 1.0);
    col *= smoothstep(0.5, 0.5 - rw - px, hexD) * 0.85 + 0.15;
    finish(col);
}
