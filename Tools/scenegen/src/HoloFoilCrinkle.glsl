//@doc
 * @brief HOLO FOIL CRINKLE: a sheet of crumpled holographic foil fills the picture: every little facet flashes with a
 * shifting spectral glint as the light passes over it, the glint hopping from facet to facet; the light moves with the
 * music's phase, and the foil crinkles more as the sound grows rough.  The facets are cells of a tiling, each with a
 * tilt of its own scaled by the roughness (smoothed in a small field of the scene's own); a facet's glint is how
 * squarely it mirrors the light toward the eye, and its colour slides with that angle -- not through the whole rainbow
 * but round one colour of the photo, a little either way.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase     -> the light passes over the foil (integrated)
 *   audioRoughness -> the foil crinkles: the facets tilt further (smoothed)
 *   audioSwell     -> the glints' strength
 *
 * Knobs: facetP (the facets' size), spreadP (how far the colour slides), hueP.
//@params facetP spreadP
//@audio audioRoughness audioPhase audioSwell
//@state 1 1 60
//@body
/**  The state pass: the roughness smoothed.
 *
 * @return
 *   x the smoothed roughness, 0, 0, 1.
 **/
vec4 stateStep()
{
    float r = clamp(audioRoughness, 0.0, 1.0);
    float old = stateFrame < 0.5 ? r : texelFetch(texState, ivec2(0, 0), 0).r;
    return vec4(mix(old, r, 0.03), 0.0, 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    float rough = texelFetch(texState, ivec2(0, 0), 0).r;
    float S = 0.05 + 0.05 * clamp(facetP, 0.0, 1.0);
    vec2 g = p / S;
    vec2 ip = floor(g);
    float d1 = 9.0, d2 = 9.0;
    vec2 bid = vec2(0.0);
    for (int j = -1; j <= 1; ++j)
        for (int i = -1; i <= 1; ++i) {
            vec2 c = ip + vec2(float(i), float(j));
            vec2 o = c + hash22(c);
            float d = length(g - o);
            if (d < d1) { d2 = d1; d1 = d; bid = c; }
            else if (d < d2) d2 = d;
        }
    vec2 tl = (hash22(bid + 9.1) - 0.5) * (0.4 + 1.2 * rough);
    vec3 n = normalize(vec3(tl, 1.0));
    float la = 0.05 * sceneTime + 0.5 * audioPhase;
    vec3 L = normalize(vec3(0.8 * cos(la), 0.6 * sin(0.8 * la), 1.0));
    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
    float ndh = max(dot(n, H), 0.0);
    float glint = pow(ndh, 18.0);
    float spread = 0.03 + 0.06 * clamp(spreadP, 0.0, 1.0);
    vec3 spec = hsv2rgb(vec3(fract(fh + spread * sin(ndh * 25.0 + bid.x)), 0.55, 1.0));
    float edge = smoothstep(0.0, 0.06, d2 - d1);
    vec3 base = famCol(fh, 0.4) * (0.08 + 0.12 * dot(n, L));
    vec3 col = base + spec * glint * (0.5 + 1.0 * clamp(audioSwell, 0.0, 1.0)) * edge + spec * 0.05 * (1.0 - edge);
    finish(col);
}
