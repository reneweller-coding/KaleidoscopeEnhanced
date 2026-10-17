//@doc
 * @brief SANDPILE IDENTITY MANDALA: the identity of the abelian sandpile on a rectangle -- the one stable pile
 * that, added to any other, changes nothing -- a razor-sharp fractal mandala.  It is built live: grains rain in at
 * the border (the burning configuration, which is the same as adding nothing), cells holding four topple to their
 * neighbours, and avalanches sweep inward; once the centre has toppled every cell has (Dhar's burning test), the
 * rain stops, and the pile settles into the mandala.  The rectangle is mirrored at its edges across
 * the frame.  Each height shows its own cut of the photo; toppling cells glow.
 *
 * Audio Reactivity (structure, not only light):
 *   audioDrop       -> the border is fed once more: every cell topples exactly once, an avalanche runs in from the
 *                      edges and the mandala forms again (structure)
 *   audioPhrasePos  -> the same at the start of every phrase
 *   audioPhase      -> the palette turns through the photo (integrated)
 *   audioKick       -> the toppling cells flash (light)
 *
 * Knobs: sizeP (the rectangle: small and coarse or large and fine), aspectP (its proportions), hueP.
//@params sizeP aspectP
//@audio audioKick audioDrop audioPhrasePos
//@state 144 144 960 32
//@body
/**  The rectangle's size in cells.
 *
 * @return
 *   Width and height.
 **/
ivec2 rectSize()
{
    float w = floor(80.0 + 60.0 * clamp(sizeP, 0.0, 1.0));
    float h = floor(w * (0.5 + 0.45 * clamp(aspectP, 0.0, 1.0)));
    return ivec2(int(w), int(h));
}
/**  A cell's height, 0 outside the rectangle (the sink).
 *
 * @param ip  The cell. (in)
 * @param r   The rectangle's size. (in)
 *
 * @return
 *   The grains on the cell.
 **/
float heightAt(ivec2 ip, ivec2 r)
{
    if (ip.x < 0 || ip.y < 0 || ip.x >= r.x || ip.y >= r.y) return 0.0;
    return texelFetch(texState, ip, 0).r;
}

/**  One parallel toppling step for this cell (the state pass): a cell with z grains fires floor(z / 4) times at
 * once (the result is the same in any order -- the pile is abelian); the border is fed while the mandala builds and
 * again on a drop.
 *
 * @return
 *   Grains, toppling glow, 1 once the cell has toppled, 1.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    ivec2 r = rectSize();
    if (stateFrame < 0.5 || ip.x >= r.x || ip.y >= r.y) return vec4(0.0, 0.0, 0.0, 1.0);
    vec4 c = texelFetch(texState, ip, 0);
    float z = c.r;
    float fire = floor(z / 4.0);
    float z2 = z - 4.0 * fire;
    z2 += floor(heightAt(ip + ivec2(1, 0), r) / 4.0) + floor(heightAt(ip - ivec2(1, 0), r) / 4.0)
          + floor(heightAt(ip + ivec2(0, 1), r) / 4.0) + floor(heightAt(ip - ivec2(0, 1), r) / 4.0);
    // the burning configuration: one grain per edge to the sink
    float beta = float(ip.x == 0) + float(ip.x == r.x - 1) + float(ip.y == 0) + float(ip.y == r.y - 1);
    bool build = texelFetch(texState, r / 2, 0).b < 0.5;       // until the centre has toppled: then every cell has
    bool phrase = audioPhrasePos > 0.001 && audioPhrasePos < 0.03;
    bool feed = mod(stateFrame, 480.0) < 1.0 && (clamp(audioDrop, 0.0, 1.0) > 0.5 || phrase);
    if (build) z2 += 4.0 * beta;                               // four burning configurations a step: the same in the end
    else if (feed) z2 += beta;
    float glow = fire > 0.5 ? 1.0 : c.g * 0.96;
    return vec4(z2, glow, max(c.b, fire > 0.5 ? 1.0 : 0.0), 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    ivec2 r = rectSize();
    vec2 rs = vec2(r);
    // the rectangle mirrored at its edges across the frame, its height filling 0.95 of the screen
    vec2 q = p / 0.95 * rs.y + 0.5 * rs;
    vec2 m = rs - abs(mod(q, 2.0 * rs) - rs);
    ivec2 cell = clamp(ivec2(floor(m)), ivec2(0), r - 1);
    vec4 c = texelFetch(texState, cell, 0);
    float h = min(c.r, 4.0);
    vec2 f = abs(fract(m) - 0.5);
    float bevel = 1.0 - 0.3 * smoothstep(0.32, 0.5, max(f.x, f.y));
    vec2 uv = q / rs.y * 0.7 + 0.012 * sceneTime * vec2(1.0, 0.6);   // the photo drifts under the mandala
    vec3 photo = imgLod(uv + vec2(0.31, 0.53) * floor(h), 0.4);   // every height its own cut of the photo
    vec3 tone = imgPalette(floor(h) * 0.17 + 0.03 * audioPhase);
    vec3 col = mix(photo, tone, 0.45) * (0.15 + 0.3 * floor(h)) * bevel;
    col += mix(tone, vec3(1.0), 0.4) * c.g * (0.5 + 0.8 * clamp(audioKick, 0.0, 1.0));
    col += mix(tone, vec3(1.0), 0.5) * min(max(c.r - 3.5, 0.0) * 0.05, 0.6);   // piles above three glow
    finish(col);
}
