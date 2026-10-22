//@doc
 * @brief TEXTURE SUN THROUGH AMBER: the photo becomes a great disc of amber held against the sun: light shines through
 * it from behind, glowing where the sun stands and scattering through the whole slab, with bubbles and flecks caught
 * inside; the sun wanders behind the disc with the music's phase and the scattering deepens as it swells.  The disc is
 * the photo, warmed and calmed toward one colour family; its brightness is the light reaching each place -- a bright
 * core where the sun stands and a broad glow that widens with the scattering (the photo read softer the more it
 * scatters); the bubbles are round bright and dark spots that drift slowly.  A halo surrounds the disc.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase -> the sun wanders behind the disc (integrated)
 *   audioSwell -> the scattering deepens and the glow widens
 *
 * Knobs: sizeP (the disc's size), bubbleP (how many bubbles), hueP.
//@params sizeP bubbleP
//@audio audioPhase audioSwell
//@body
/**  The photo's colour calmed toward the colour family.
 *
 * @param photo  The photo's colour. (in)
 * @param fh     The family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 tone(vec3 photo, float fh)
{
    float l = luma(photo);
    return mix(photo * 1.1, famCol(fh, 0.15 + 0.7 * l) * (0.25 + 1.2 * l), 0.45);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float R = 0.62 + 0.25 * clamp(sizeP, 0.0, 1.0);
    float sw = clamp(audioSwell, 0.0, 1.0);
    float sa = 0.03 * sceneTime + 0.35 * audioPhase;
    vec2 sun = 0.45 * R * vec2(cos(sa), sin(0.8 * sa));
    float r = length(p);
    vec3 amber = famLight(fh, 0.8, 0.25);
    float scatter = 1.5 + 2.0 * sw;
    vec3 body = tone(imgLod(vec2(0.5) + p / (2.0 * R) * vec2(1.0, 1.0), scatter), fh);
    body = mix(body, amber * (0.3 + 0.9 * luma(body)), 0.4);
    float ds = length(p - sun);
    float core = exp(-ds * ds / 0.01) * 1.6;
    float glowW = 0.25 + 0.3 * sw;
    float light = 0.25 + core + 0.9 * exp(-ds / glowW);
    // bubbles and flecks drifting slowly in the slab
    float nb = 30.0 + 50.0 * clamp(bubbleP, 0.0, 1.0);
    vec2 g = (p + vec2(0.01 * sceneTime, 0.006 * sceneTime)) * 9.0;
    vec2 cell = floor(g), l = fract(g) - 0.5;
    vec2 h = hash22(cell);
    float bub = 0.0;
    if (h.x < nb / 100.0) {
        float rb = 0.08 + 0.15 * h.y;
        float d = length(l - (h - 0.5) * 0.5);
        bub = (1.0 - smoothstep(rb * 0.8, rb, d)) * (h.y > 0.5 ? 0.6 : -0.4) + exp(-pow((d - rb) / 0.02, 2.0)) * 0.5;
    }
    vec3 disc = body * light * (1.0 + bub * 0.8);
    float inside = 1.0 - smoothstep(R - 0.004, R + 0.004, r);
    float rimL = exp(-pow((r - R) / 0.01, 2.0)) * 0.6;
    vec3 col = mix(amber * 0.25 * exp(-max(r - R, 0.0) * 4.0) * (0.5 + 0.7 * sw), disc, inside);
    col += amber * rimL * (0.4 + 0.6 * exp(-length(p / r * R - sun) * 3.0));
    finish(col);
}
