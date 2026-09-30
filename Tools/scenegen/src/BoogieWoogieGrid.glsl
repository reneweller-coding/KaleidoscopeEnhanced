//@doc
 * @brief BOOGIE WOOGIE GRID: Mondrian's Broadway Boogie Woogie set to music
 * -- a city grid of yellow streets on white, each street dotted with
 * small blocks of red, blue and grey that race along like traffic lights
 * and taxis, larger coloured blocks sitting in the squares between, some
 * holding a small window of the photograph; the street pattern is endless
 * and the traffic never stops.  Mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the traffic moves (integrated, jump-free)
 *   audioSpread     -> the traffic density
 *   audioKick       -> the blocks light up (light)
 *   audioMode       -> the ground: grey night in minor, white day in major
 *   audioRoughness  -> the street widths vary
 *   audioSwell      -> the photo windows glow (slow)
 *
 * Knobs: gridP (grid density), blockP (block size), photoP (photo windows), hueP.
//@params gridP blockP photoP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
vec3 bwPal(float k)
{
    k = mod(k, 4.0);
    return k < 1.0 ? vec3(0.85, 0.12, 0.1) : (k < 2.0 ? vec3(0.1, 0.22, 0.7) : (k < 3.0 ? vec3(0.95, 0.85, 0.1) : vec3(0.7, 0.7, 0.72)));
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float S = 3.0 + 3.0 * clamp(gridP, 0.0, 1.0);
    vec2 g = p * S + vec2(0.02, 0.01) * sceneTime;
    vec2 gi = floor(g);
    vec2 f = fract(g);
    // Streets: bands along the cell borders, width varying per street.
    float wx = 0.07 + 0.04 * rough * (hash11(gi.x * 1.3) - 0.5) * 2.0;
    float wy = 0.07 + 0.04 * rough * (hash11(gi.y * 2.7 + 5.0) - 0.5) * 2.0;
    float onV = step(f.x, wx);                                  // vertical street at the left edge
    float onH = step(f.y, wy);                                  // horizontal street at the bottom edge
    vec3 ground = mix(vec3(0.5, 0.5, 0.52), vec3(0.95, 0.94, 0.9), mode);
    vec3 col = ground;
    // Blocks in the squares.
    float bh = hash21(gi + 3.0);
    if (bh < 0.35) {
        vec2 bc = vec2(0.3 + 0.4 * hash21(gi + 5.0), 0.3 + 0.4 * hash21(gi + 7.0));
        vec2 bs = (0.12 + 0.2 * clamp(blockP, 0.0, 1.0)) * vec2(0.7 + 0.6 * hash21(gi + 9.0), 0.7 + 0.6 * hash21(gi + 11.0));
        vec2 d = abs(f - bc) - bs;
        if (max(d.x, d.y) < 0.0) {
            col = bwPal(floor(bh * 40.0));
            // Some blocks hold a window of the photo.
            if (hash21(gi + 13.0) < 0.5 * clamp(photoP, 0.0, 1.0)) {
                vec2 wd = abs(f - bc) - bs * 0.55;
                if (max(wd.x, wd.y) < 0.0) col = imgLod((f - bc) / bs * 0.2 + hash22(gi), 1.0) * (0.8 + 0.5 * swell);
            }
        }
    }
    // Streets: yellow with traffic blocks.
    float T = 0.4 * sceneTime + 2.5 * audioAdvance;
    float dens = 0.3 + 0.5 * clamp(audioSpread, 0.0, 1.0);
    if (onV > 0.5 || onH > 0.5) {
        col = vec3(0.95, 0.82, 0.12);
        // Traffic along the street: small squares, moving.
        float along = onV > 0.5 ? g.y : g.x;
        float lane = onV > 0.5 ? gi.x : gi.y + 100.0;
        float dir = mod(lane, 2.0) < 0.5 ? 1.0 : -1.0;
        float x = along * 12.0 + dir * T * (0.6 + 0.6 * hash11(lane));
        float ci = floor(x);
        float fx = fract(x);
        float h = hash21(vec2(ci, lane));
        if (h < dens && fx > 0.15 && fx < 0.85) {
            col = bwPal(floor(h * 40.0) + 1.0) * (1.0 + 0.6 * kick * step(0.5, hash21(vec2(lane, ci))));
        }
    }
    col = mix(col, col * glowColour(imgLod(p * 0.5 + 0.5, 6.0), p, hueP * 0.159) * 1.3, 0.05);
    finish(col);
}
