//@doc
 * @brief FRESNEL LENS WARP: a Fresnel lens over the photo -- a magnifying lens collapsed into concentric rings, each
 * ring a sloped facet of the lens, so the picture is magnified, but in steps: every ring shows its own slice of the
 * photo, shifted against its neighbours, and the ring edges catch the light like cut glass.  The lens breathes, its
 * focus wanders; lenses repeat mirrored across the frame.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the focal power: loud passages magnify more
 *   audioChromaHue  -> the rings' width follows the key's hue (continuous)
 *   audioPhase      -> the lenses' centres wander (integrated)
 *   audioKick       -> the ring edges flash (light)
 *
 * Knobs: ringsP (the base ring width), lensesP (lenses across the frame), prismP (how much each ring is shifted), hueP.
//@params ringsP lensesP prismP
//@audio audioSwell audioKick
//@body
void main()
{
    vec2 p = screenP();
    float lenses = 1.0 + floor(clamp(lensesP, 0.0, 0.999) * 3.0);
    vec2 cell = vec2(1.7777778, 1.0) / lenses;
    vec2 g = p + 0.5 * cell;
    vec2 id = floor(g / cell);
    vec2 l = mod(g, cell) - 0.5 * cell;                         // the lens's own coordinate
    l *= vec2(mod(id.x, 2.0) < 0.5 ? 1.0 : -1.0, mod(id.y, 2.0) < 0.5 ? 1.0 : -1.0);   // mirrored neighbours
    vec2 c = 0.08 * vec2(sin(0.04 * audioPhase + 0.03 * sceneTime), cos(0.03 * audioPhase + 0.02 * sceneTime)) / lenses;
    vec2 d = l - c;
    float r = length(d);
    float w = (0.025 + 0.04 * clamp(ringsP, 0.0, 1.0)) * (1.0 + 0.25 * sin(audioChromaHue)) / sqrt(lenses);
    float ring = floor(r / w), fr = fract(r / w);
    // a lens's facet: the magnified radius, restarted in every ring (the Fresnel collapse), each ring shifted a little
    float power = 0.35 + 0.35 * clamp(audioSwell, 0.0, 1.0);
    float rm = (ring * w * (1.0 - power) + fr * w * (1.0 - power * 0.6)) + (0.004 + 0.02 * clamp(prismP, 0.0, 1.0)) * ring;
    vec2 q = c + (r > 1e-4 ? d / r : vec2(0.0)) * rm;
    vec2 uv = (id * cell + q) * 0.6 + 0.5;
    vec3 photo = imgLod(uv, 0.4);
    float edge = smoothstep(0.85, 1.0, fr);
    vec3 tone = imgPalette(ring * 0.05 + 0.03 * audioPhase);
    vec3 col = photo * (0.85 + 0.25 * fr) + mix(tone, vec3(1.0), 0.6) * edge * 0.35 * (0.5 + clamp(audioKick, 0.0, 1.0));
    finish(col);
}
