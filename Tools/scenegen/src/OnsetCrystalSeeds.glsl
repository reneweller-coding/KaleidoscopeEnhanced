//@doc
 * @brief ONSET CRYSTAL SEEDS: every onset in the music sows a crystal -- a seed somewhere in the frame from which a
 * polygonal crystal grows outward, its own cut of the photo inside it, until the next ones grow over it.  The
 * newest crystal lies on top, so the frame is a living patchwork of overlapping crystal faces, the busy passages
 * scattering many small ones, the quiet passages letting a few grow large.  The seeds are kept on the state pass.
 *
 * Audio Reactivity (structure, not only light):
 *   audioOnset      -> each onset sows a crystal (on the state pass); its strength sets the crystal's facets
 *   audioKick       -> the youngest crystals' faces flash (light)
 *
 * Knobs: growthP (how fast the crystals grow), facetP (the crystals' facets), photoP (photo share), hueP.
//@params growthP facetP photoP
//@audio audioOnset audioKick
//@state 65 1 60
//@body
/**  The state pass: texel 64 detects onsets (at most four a second) and counts them; texel j, when its turn comes,
 * takes a new seed: place, birth time, facets.
 *
 * @return
 *   Texel 64: the count (r), the time of the last onset (g); texel j: the place (rg), the birth (b), the facets (a).
 **/
vec4 stateStep()
{
    int i = int(gl_FragCoord.x);
    float now = stateFrame / 60.0;
    vec4 ctl = texelFetch(texState, ivec2(64, 0), 0);
    bool onset = clamp(audioOnset, 0.0, 1.0) > 0.45 && now - ctl.g > 0.25;
    if (stateFrame < 0.5) {
        if (i == 64) return vec4(0.0, -10.0, 0.0, 1.0);
        return vec4((stRand(0) - 0.5) * vec2(1.78, 1.0), -0.6 * float(64 - i), 4.0 + floor(4.0 * stRand(1)));   // a patchwork to start from
    }
    if (i == 64) return onset ? vec4(ctl.r + 1.0, now, 0.0, 1.0) : ctl;
    vec4 me = texelFetch(texState, ivec2(i, 0), 0);
    if (onset && i == int(mod(ctl.r + 1.0, 64.0))) {
        float facets = 3.0 + floor(5.0 * clamp(audioOnset, 0.0, 1.0)) + floor(2.0 * stRand(1));
        return vec4((stRand(0) - 0.5) * vec2(1.78, 1.0), now, facets);
    }
    return me;
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float now = stateFrame / 60.0 + stateFrac / 60.0;
    float v = 0.04 + 0.08 * clamp(growthP, 0.0, 1.0);
    float bestB = -1e9;
    vec4 best = vec4(0.0);
    int bestI = 0;
    for (int i = 0; i < 64; ++i) {
        vec4 s = texelFetch(texState, ivec2(i, 0), 0);
        float age = now - s.b;
        if (age < 0.0 || s.b < bestB) continue;
        // the crystal's polygonal reach (its facets set by the seed, its turn by its index)
        vec2 d = p - s.xy;
        float n = s.a + floor(3.0 * clamp(facetP, 0.0, 1.0));
        float th = atan(d.y, d.x) + float(i) * 1.37;
        float sec = 6.2831853 / n;
        float poly = length(d) * cos(mod(th, sec) - 0.5 * sec) / cos(0.5 * sec);
        if (poly < v * age) { bestB = s.b; best = s; bestI = i; }
    }
    vec3 col = imgLod(p * 0.3 + 0.5, 5.0) * 0.1;
    if (bestB > -1e8) {
        float age = now - best.b;
        float hc = hash11(float(bestI) * 7.13 + floor(best.b * 3.0));
        vec2 uv = 0.5 + 0.3 * vec2(cos(6.2831853 * hc), sin(6.2831853 * hc)) + rot2(6.2831853 * hc) * (p - best.xy) * 0.7;
        vec3 photo = imgLod(uv, 0.5);
        vec3 tone = imgPalette(hc + 0.03 * audioPhase);
        // the face: a facet shading by angle, the fresh edge glowing
        vec2 d = p - best.xy;
        float n = best.a + floor(3.0 * clamp(facetP, 0.0, 1.0));
        float th = atan(d.y, d.x) + float(bestI) * 1.37;
        float facet = floor(mod(th, 6.2831853) / (6.2831853 / n));
        float shade = 0.75 + 0.25 * hash11(facet + hc * 10.0);
        vec3 c = mix(tone * 1.2, photo * 1.4, 0.5 + 0.45 * clamp(photoP, 0.0, 1.0)) * shade;
        float sec = 6.2831853 / n;
        float poly = length(d) * cos(mod(th, sec) - 0.5 * sec) / cos(0.5 * sec);
        float front = smoothstep(0.012, 0.0, v * age - poly) * exp(-age / 6.0);
        c += mix(tone, vec3(1.0), 0.6) * front * (0.5 + 0.8 * clamp(audioKick, 0.0, 1.0));
        col = c;
    }
    finish(col * 1.05);
}
