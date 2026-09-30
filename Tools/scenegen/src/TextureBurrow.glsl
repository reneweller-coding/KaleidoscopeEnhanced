//@doc
 * @brief TEXTURE BURROW: crawling through an organic burrow -- a tunnel with
 * soft, irregular, breathing walls, its cross-section a wobbling blob
 * rather than a circle, the walls ribbed with rings like a gullet and
 * lined with the photograph, glistening wet in a light that we carry
 * with us; the passage winds and narrows and widens as we move.
 * Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the crawl (integrated, jump-free)
 *   audioSpread     -> the walls breathe wider
 *   audioBass       -> the wet glisten (light)
 *   audioMode       -> the light: cold blue in minor, warm red in major
 *   audioRoughness  -> the ribs deepen
 *   audioSwell      -> depth darkness (slow)
 *
 * Knobs: ribP (rib spacing), wobbleP (cross-section wobble), wallZoomP, hueP.
//@params ribP wobbleP wallZoomP
//@audio audioSpread audioBass audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float bass = clamp(audioBass, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float travel = 0.35 * sceneTime + 2.5 * audioAdvance;
    // The passage winds: shift the centre with depth-dependent offset (approx.).
    vec2 bend = 0.12 * vec2(sin(travel * 0.4), cos(travel * 0.33));
    vec2 q = p - bend * 0.5;
    float a = atan(q.y, q.x);
    vec2 cs = vec2(cos(a), sin(a));
    float r = max(length(q), 1e-4);
    // Wobbling cross-section: radius varies with angle (on the unit circle, no seam) and depth.
    float wob = 0.15 + 0.35 * clamp(wobbleP, 0.0, 1.0);
    float z = 0.5 / r;
    for (int i = 0; i < 3; ++i) {
        float wz0 = z + travel;
        float R = 1.0 + wob * (fbm3(cs * 1.5 + vec2(wz0 * 0.2, 0.0)) - 0.5) * 2.0;
        R *= 1.0 + (0.1 + 0.15 * clamp(audioSpread, 0.0, 1.0)) * sin(0.8 * sceneTime + wz0 * 0.5);
        z = 0.5 * R / r;
    }
    float wz = z + travel;
    // Ribs: rings along the depth.
    float rf = 2.0 + 3.0 * clamp(ribP, 0.0, 1.0);
    float rib = 0.5 + 0.5 * cos(wz * rf * 6.2831853 / 3.0);
    float ribD = (0.3 + 0.5 * rough) * pow(rib, 3.0);
    float zoom = 0.3 + 0.4 * clamp(wallZoomP, 0.0, 1.0);
    vec2 uv = vec2(a / 3.14159265, wz * zoom * 0.3);
    float fw = max(length(fwidth(cs)) / 3.14159265, fwidth(z) * zoom * 0.3) * 1024.0;
    vec3 wall = imgLod(uv, clamp(log2(max(fw, 1.0)), 0.0, 9.0));
    vec3 flesh = mix(vec3(0.55, 0.65, 0.85), vec3(0.95, 0.55, 0.5), mode);
    vec3 col = mix(wall, wall * flesh * 1.3, 0.5);
    // Headlamp we carry: the near wall bright, ribs shading.
    float lamp = exp(-z * (0.12 + 0.15 * swell));
    col *= (0.35 + 0.8 * lamp) * (1.0 - ribD * 0.6);
    // Wet glisten on the rib crests.
    float wet = pow(rib, 12.0) * (0.3 + 0.7 * noise2(vec2(a * 6.0, wz * 3.0)));
    col += mix(flesh, vec3(1.0), 0.6) * wet * lamp * (0.25 + 0.8 * bass);
    // Darkness in the depth, a faint glow where the passage continues.
    vec3 gc = glowColour(imgLod(vec2(0.5), 6.0), vec2(travel * 0.03, 0.0), hueP * 0.159);
    col = mix(gc * 0.05, col, exp(-z * 0.08));
    col += gc * exp(-r * 12.0) * 0.3;
    finish(col);
}
