//@doc
 * @brief BUBBLE FOG SPOTLIGHTS: soap bubbles drift through coloured spotlight cones in fog: where a bubble crosses a
 * beam its skin flashes in thin-film shades and its rim glints, outside the beams it is almost invisible; the cones
 * themselves glow in the fog and swing slowly.  The cones come from above, each a wedge of light fading with
 * distance and toward its edges; the bubbles rise on three depth layers.  The spotlights' colours are shades of one
 * colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the cones swing (integrated) and the bubbles rise
 *   audioOnset   -> a share of the bubbles pops (they fade, small)
 *   audioSwell   -> the fog thickens: the cones glow more
 *
 * Knobs: coneP (how many spotlights), bubbleP (how many bubbles), hueP.
//@params coneP bubbleP
//@audio audioOnset audioSwell
//@body
/**  The spotlights' light at a point: wedges from above, swinging.
 *
 * @param p      The point. (in)
 * @param n      How many spotlights. (in)
 * @param swing  The swing's phase. (in)
 * @param fh     The colour family. (in)
 *
 * @return
 *   The light.
 **/
vec3 cones(vec2 p, float n, float swing, float fh)
{
    vec3 col = vec3(0.0);
    for (int i = 0; i < 5; ++i) {
        float fi = float(i);
        if (fi >= n) break;
        vec2 src = vec2(-0.8 + 1.6 * (fi + 0.5) / n, 0.62);
        float aim = 0.45 * sin(swing * (0.7 + 0.2 * fi) + 1.9 * fi);
        vec2 d = p - src;
        float ang = atan(d.x, -d.y) - aim;
        float beam = smoothstep(0.22, 0.12, abs(ang)) * exp(-length(d) * 0.7);
        col += famLight(fh, fi / max(n - 1.0, 1.0), 0.25) * beam;
    }
    return col;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float n = floor(3.0 + 2.0 * clamp(coneP, 0.0, 1.0));
    float fog = 0.35 + 0.45 * clamp(audioSwell, 0.0, 1.0);
    float swing = 0.05 * sceneTime + 0.25 * audioAdvance;
    float rise = 0.02 * sceneTime + 0.08 * audioAdvance;
    vec3 light = cones(p, n, swing, fh);
    vec3 col = light * fog * (0.7 + 0.3 * fbm(p * 2.5 + vec2(0.02 * sceneTime, -rise)));
    for (int L = 2; L >= 0; --L) {
        float fl = float(L);
        float S = 0.24 / (1.0 + 0.5 * fl);
        vec2 g = (p + vec2(0.05 * sin(rise * 3.0 + fl), -rise * (1.0 + 0.3 * fl))) / S;
        vec2 cid = floor(g);
        float hc = fract(sin(dot(cid, vec2(12.9898, 78.233)) + 13.0 * fl) * 43758.5453);
        if (hc > 0.25 + 0.45 * clamp(bubbleP, 0.0, 1.0)) continue;
        float pop = 1.0 - clamp(audioOnset, 0.0, 1.0) * step(0.85, fract(hc * 17.0));
        vec2 c = cid + 0.5 + 0.3 * (vec2(fract(hc * 7.3), fract(hc * 3.1)) - 0.5);
        float R = 0.22 + 0.15 * fract(hc * 5.7);
        float r = length(g - c) / R;
        if (r > 1.05) continue;
        vec3 lit = cones(c * S - vec2(0.05 * sin(rise * 3.0 + fl), -rise * (1.0 + 0.3 * fl)), n, swing, fh);
        float film = pow(r, 5.0) * smoothstep(1.02, 0.96, r);
        vec3 skin = famLight(fh, fract(hc + 2.0 * r), 0.5) * film;
        float glint = exp(-pow(length((g - c) / R - vec2(-0.35, 0.4)) / 0.15, 2.0));
        col += (skin * 1.6 + vec3(glint) * 0.8) * (0.05 + 1.4 * luma(lit)) * pop * (1.0 - 0.2 * fl);
    }
    finish(famExpose(col, 1.55, 1.00, 0.00, fh));
}
