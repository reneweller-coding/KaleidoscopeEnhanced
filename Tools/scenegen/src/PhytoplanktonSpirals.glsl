//@doc
 * @brief PHYTOPLANKTON SPIRALS: plankton blooms in ocean eddies seen from a satellite, without a coast, without end --
 * the green and turquoise bloom drawn out by a field of drifting eddies into filaments, spirals and fronts, the
 * dark open water between them.  The eddies wander and the bloom is wound into ever finer curls; it renews itself
 * in two phases that take over from each other unseen.  The photo tints the water and the bloom.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the eddies turn (integrated)
 *   audioAdvance    -> the bloom is wound on (integrated)
 *   audioKick       -> the densest filaments glint (light)
 *
 * Knobs: eddiesP (how many eddies), windP (how far the bloom is wound), photoP (photo share), hueP.
//@params eddiesP windP photoP
//@audio audioKick
//@body
/**  The eddies' flow: drifting vortices of both senses over a slow shear.
 *
 * @param x    The point. (in)
 * @param n    How many eddies. (in)
 * @param rot  Their turning. (in)
 *
 * @return
 *   The velocity.
 **/
vec2 eddyFlow(vec2 x, float n, float rot)
{
    vec2 u = vec2(0.05 * sin(3.0 * x.y), 0.0);
    for (int i = 0; i < 9; ++i) {
        float fi = float(i);
        if (fi >= n) break;
        vec2 c = vec2(0.85 * sin(0.021 * sceneTime + 2.3 * fi), 0.45 * cos(0.017 * sceneTime + 1.9 * fi));
        vec2 d = x - c;
        float r2 = dot(d, d) + 0.01;
        float g = (mod(fi, 2.0) < 0.5 ? 1.0 : -1.0) * (0.03 + 0.01 * sin(rot + fi));
        u += g * vec2(-d.y, d.x) / r2 * exp(-r2 / 0.08);
    }
    return u;
}

void main()
{
    vec2 p = screenP();
    float n = floor(4.0 + 5.0 * clamp(eddiesP, 0.0, 1.0));
    float rot = 0.02 * audioPhase;
    float span = 6.0 + 10.0 * clamp(windP, 0.0, 1.0);
    float T = 0.05 * sceneTime + 0.15 * audioAdvance;
    float bloom = 0.0;
    vec2 tint = vec2(0.0);
    for (int ph = 0; ph < 2; ++ph) {
        float f = fract(T + 0.5 * float(ph));
        float w = 1.0 - abs(2.0 * f - 1.0);
        vec2 x = p;
        for (int s = 0; s < 16; ++s) x -= eddyFlow(x, n, rot) * f * span / 16.0;
        float b = smoothstep(0.35, 0.75, fbm(x * 3.0 + float(ph) * 5.3));
        bloom += w * b;
        tint += w * x;
    }
    vec3 photo = imgLod(tint * 0.5 + 0.5, 2.0);
    vec3 water = mix(vec3(0.02, 0.06, 0.1), photo * 0.25, 0.5);
    vec3 green = mix(vec3(0.15, 0.55, 0.4), vec3(0.3, 0.75, 0.65), photo.g) * 0.9;
    vec3 tone = imgPalette(0.3 + 0.03 * audioPhase);
    vec3 algae = mix(green, photo * 1.5, 0.25 + 0.45 * clamp(photoP, 0.0, 1.0)) * mix(vec3(1.0), tone * 1.4, 0.25);
    vec3 col = mix(water, algae, bloom);
    col += algae * smoothstep(0.85, 1.0, bloom) * 0.3 * clamp(audioKick, 0.0, 1.0);
    finish(col * 1.1);
}
