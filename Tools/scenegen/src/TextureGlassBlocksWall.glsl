//@doc
 * @brief TEXTURE GLASS BLOCKS WALL: a wall of pressed glass blocks with the
 * photograph moving slowly behind it -- each block bends the view in its
 * own pattern (ribbed, rippled, pillowed or with concentric waves), so
 * the picture breaks into a grid of distorted fragments, sharp in some
 * blocks and swimming in others; the blocks' edges gleam, the mortar
 * joints are pale, and a highlight wanders across the glass.  Endless,
 * mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the scene behind glides past (integrated, jump-free)
 *   audioSpread     -> refraction strength
 *   audioKick       -> the block edges gleam (light)
 *   audioMode       -> glass tint: blue-green in minor, amber in major
 *   audioRoughness  -> the ripples get finer
 *   audioSwell      -> the light behind brightens (slow)
 *
 * Knobs: blockP (block size), mortarP (joint width), patternP (pattern mix), hueP.
//@params blockP mortarP patternP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float bs = 0.18 + 0.15 * clamp(blockP, 0.0, 1.0);
    vec2 g = p / bs;
    vec2 bi = floor(g);
    vec2 l = fract(g) - 0.5;                                    // -0.5..0.5 in the block
    float h = hash21(bi);
    // Pattern of this block (four kinds), blended by the knob so it can change smoothly.
    float kind = floor(fract(h + clamp(patternP, 0.0, 1.0) * 0.999) * 4.0);
    float freq = 6.0 + 6.0 * rough;
    vec2 off;
    if (kind < 0.5) off = vec2(sin(l.x * freq * 3.14), 0.0) * 0.08;                         // ribbed
    else if (kind < 1.5) off = vec2(sin(l.y * freq * 3.0 + l.x * 4.0), sin(l.x * freq * 3.0)) * 0.05; // rippled
    else if (kind < 2.5) off = -l * 0.6 * (1.0 - 4.0 * dot(l, l));                        // pillow (magnifying)
    else { float rr = length(l); off = l / max(rr, 1e-3) * sin(rr * freq * 8.0) * 0.04; }   // concentric
    off *= 0.6 + 0.8 * clamp(audioSpread, 0.0, 1.0);
    vec2 uv = p * 0.5 + 0.5 + vec2(0.01, 0.004) * sceneTime + vec2(0.06, 0.0) * audioAdvance + off * bs;
    vec3 behind = imgLod(uv, 0.8 + 1.5 * step(0.5, kind) * (1.0 - step(2.5, kind))) * (0.8 + 0.4 * swell);
    vec3 tint = mix(vec3(0.8, 0.95, 0.95), vec3(1.05, 0.9, 0.7), mode);
    vec3 col = behind * tint;
    // Block edge: the glass thickens and gleams near the border.
    float ed = 0.5 - max(abs(l.x), abs(l.y));                   // distance to the block border
    float px = fwidth(g.x) * 1.2;
    col *= 0.7 + 0.3 * smoothstep(0.0, 0.08, ed);
    vec3 gc = glowColour(imgLod(uv, 5.0), bi * 0.1, hueP * 0.159);
    col += mix(gc, vec3(1.0), 0.6) * exp(-(ed - 0.02) * (ed - 0.02) / 0.0003) * (0.15 + 0.5 * kick);
    // Mortar joints.
    float mw = 0.015 + 0.03 * clamp(mortarP, 0.0, 1.0);
    float mortar = smoothstep(mw + px, mw - px, ed);
    col = mix(col, vec3(0.72, 0.7, 0.66) * (0.8 + 0.2 * noise2(g * 40.0)), mortar);
    // A highlight wandering over the glass.
    vec2 hc = vec2(0.6 * sin(0.04 * sceneTime), 0.3 * cos(0.03 * sceneTime));
    col += vec3(1.0) * exp(-dot(p - hc, p - hc) * 8.0) * 0.12 * (1.0 - mortar);
    finish(col);
}
