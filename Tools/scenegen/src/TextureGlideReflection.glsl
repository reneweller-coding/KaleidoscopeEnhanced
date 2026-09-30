//@doc
 * @brief TEXTURE GLIDE REFLECTION: a frieze of the photograph repeated by
 * glide reflection -- tiles of the picture, each mirrored and shifted half
 * a step against its neighbour, interlock in herringbone and zigzag like
 * a woven or parquet pattern; the pattern slowly glides along its axis,
 * the axis itself turns, and the tiles' borders are inlaid with thin
 * lines of light.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the pattern glides (integrated, jump-free)
 *   audioPhase      -> the axis turns (integrated)
 *   audioSpread     -> the tile aspect (longer planks when wide)
 *   audioKick       -> the inlay lines flash (light)
 *   audioMode       -> the tiles alternate light/dark tint (minor) or colour (major)
 *   audioSwell      -> the relief shading (slow)
 *
 * Knobs: tileP (tile size), shiftP (glide offset), inlayP (inlay width), hueP.
//@params tileP shiftP inlayP
//@audio audioPhase audioSpread audioKick audioMode audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float ts = 0.12 + 0.15 * clamp(tileP, 0.0, 1.0);
    float asp = 2.0 + 2.0 * clamp(audioSpread, 0.0, 1.0);
    vec2 q = rot2(0.02 * sceneTime + 0.2 * audioPhase + 0.785) * p / ts;
    q.x += 0.3 * sceneTime + 1.5 * audioAdvance;
    // Herringbone: rows alternate direction; each row shifted by the glide.
    float row = floor(q.y);
    float glide = (0.5 + 0.5 * clamp(shiftP, 0.0, 1.0)) * asp;
    float sx = q.x + row * glide;
    float col_ = floor(sx / asp);
    vec2 f = vec2(fract(sx / asp), fract(q.y));                 // 0..1 in the plank
    // Glide reflection: every other row mirrored.
    float odd = mod(row, 2.0);
    vec2 lf = odd > 0.5 ? vec2(f.x, 1.0 - f.y) : f;
    vec2 uv = vec2(lf.x * asp * ts * 0.9, lf.y * ts * 0.9) * 1.0 + vec2(0.5) + 0.25 * vec2(sin(0.01 * sceneTime), cos(0.013 * sceneTime));
    vec3 ph = imgLod(uv, 0.6);
    float tint = odd > 0.5 ? 0.75 : 1.1;
    vec3 tc = mix(vec3(tint), mix(vec3(1.0), glowColour(ph, vec2(row, col_), hueP * 0.159) * 1.2, 0.5), mode);
    vec3 col = ph * tc;
    // Relief: planks slightly domed.
    float dome = (1.0 - pow(abs(f.y * 2.0 - 1.0), 2.0)) * (1.0 - pow(abs(f.x * 2.0 - 1.0), 8.0));
    col *= 0.75 + (0.15 + 0.3 * swell) * dome;
    // Inlay lines of light at the borders.
    float ex = min(f.x, 1.0 - f.x) * asp, ey = min(f.y, 1.0 - f.y);
    float e = min(ex, ey);
    float px = fwidth(q.y) * 1.2 + 1e-4;
    float iw = 0.02 + 0.05 * clamp(inlayP, 0.0, 1.0);
    float inlay = smoothstep(iw + px, iw - px, e);
    vec3 gc = glowColour(imgLod(vec2(0.5), 6.0), vec2(row, 0.0), hueP * 0.159);
    col = mix(col, mix(gc, vec3(1.0), 0.4) * (0.6 + 1.2 * kick), inlay);
    finish(col);
}
