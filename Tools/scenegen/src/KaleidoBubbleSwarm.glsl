//@doc
 * @brief KALEIDO BUBBLE SWARM: hundreds of soap bubbles drifting past in depth, each a little kaleidoscope of its own:
 * the photo seen through a bubble is folded into a rosette and bent by the bubble's lens (stronger toward its rim),
 * and the bubble's skin shimmers in thin-film shades of one colour family.  Bubbles lie on three depth layers that
 * slide past at different speeds; nearer bubbles are larger and softer.  The photo's own colours, calmed toward the
 * family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the bubbles' size
 *   audioOnset   -> a share of the bubbles fades in (new bubbles arrive)
 *   audioAdvance -> the drift (integrated)
 *
 * Knobs: countP (how many bubbles), foldP (the rosettes' symmetry), hueP.
//@params countP foldP
//@audio audioSwell audioOnset
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
    float present = 0.35 + 0.5 * clamp(countP, 0.0, 1.0);
    float sides = floor(5.0 + 4.0 * clamp(foldP, 0.0, 1.0));
    float grow = 0.8 + 0.4 * clamp(audioSwell, 0.0, 1.0);
    float onset = clamp(audioOnset, 0.0, 1.0);
    float drift = 0.04 * sceneTime + 0.18 * audioAdvance;
    // the background: the photo, dim and soft
    vec3 col = tone(imgLod(p * 0.5 + 0.5, 3.5), fh) * 0.25;
    for (int L = 2; L >= 0; --L) {
        float fl = float(L);
        float S = 0.32 / (1.0 + 0.6 * fl);                       // the layer's cell size: far layers smaller
        vec2 q = p / S + vec2(drift * (1.5 - 0.4 * fl) / S * 0.3, 0.3 * sin(0.3 * drift + fl));
        vec2 cid = floor(q);
        vec2 f = fract(q) - 0.5;
        float hc = fract(sin(dot(cid, vec2(12.9898, 78.233)) + 17.0 * fl) * 43758.5453);
        float fresh = step(present + 0.15, hc) * onset;         // the onsets' new arrivals
        float on = step(hc, present) + fresh;
        if (on <= 0.0) continue;
        vec2 c = (vec2(fract(hc * 7.3), fract(hc * 3.1)) - 0.5) * 0.4;
        float R = (0.22 + 0.12 * fract(hc * 5.7)) * grow;
        vec2 d = (f - c) / R;
        float r = length(d);
        if (r >= 1.0) continue;
        // the lens: stronger toward the rim; then the rosette
        vec2 bent = d * (1.0 + 0.6 * r * r);
        float sec = 6.2831853 / sides;
        float a = abs(mod(atan(bent.y, bent.x) + 6.2831853 * hc, sec) - 0.5 * sec);
        vec2 k = length(bent) * vec2(cos(a), sin(a));
        vec3 inside = tone(imgLod(k * 0.3 + vec2(0.2 + 0.6 * hc, 0.3 + 0.4 * fract(hc * 9.1)), 0.6 + 0.4 * fl), fh);
        // the skin: thin-film shades round the rim, a highlight
        float film = pow(r, 6.0);
        vec3 skin = famLight(fh, fract(hc + 2.0 * r), 0.4) * film * 0.7;
        float hl = exp(-pow(length(d - vec2(-0.35, 0.4)) / 0.15, 2.0)) * 0.5;
        float alpha = smoothstep(1.0, 0.94, r) * (0.75 - 0.15 * fl) * min(on, 1.0);
        col = mix(col, inside * (0.9 - 0.15 * fl) + skin + famLight(fh, 0.6, 0.8) * hl, alpha);
    }
    finish(col);
}
