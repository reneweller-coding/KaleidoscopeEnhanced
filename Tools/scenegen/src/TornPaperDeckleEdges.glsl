//@doc
 * @brief TORN PAPER DECKLE EDGES: torn paper: layers of paper with irregular, fibrous torn edges that lie on top of each other; the photo lies on every layer differently, and the edges drift.  Five layers, each cut by a different noise edge; at every edge a pale fibrous band, and a soft shadow on the layer below.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread  -> the number of layers in force (smoothed)
 *   audioAdvance -> the edges drift (integrated)
 *
 * Knobs: sizeP (the roughness of the edges), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float t = 0.01 * audioAdvance + 0.015 * sceneTime;
    float n = 3.0 + 2.0 * clamp(audioSpread, 0.0, 1.0);
    float rough = 0.4 + 0.9 * clamp(sizeP, 0.0, 1.0);
    vec3 col = imgLod(p * 0.85 + 0.5, 1.0) * 0.8;
    for (int k = 0; k < 5; ++k) {
        float fk = float(k);
        float on = clamp(n - fk, 0.0, 1.0);
        float ang = 1.1 * fk + 0.4;
        vec2 dir = vec2(cos(ang), sin(ang));
        float off = (0.5 - 0.22 * fk) * (0.5 + 0.5 * sin(0.4 * fk + t * 2.0));
        float edge = dot(p, dir) - off * 0.0 - (-0.25 + 0.14 * fk) + 0.07 * sin(0.9 * fk + t * 3.0);
        float nz = (fbm(vec2(dot(p, vec2(-dir.y, dir.x)) * 4.0 * (0.8 + 0.2 * rough), fk * 3.0 + t)) - 0.5) * 0.14 * rough + (noise2(vec2(dot(p, vec2(-dir.y, dir.x)) * 60.0, fk)) - 0.5) * 0.012 * rough;
        float d = edge + nz;
        float on_ = smoothstep(0.0, 0.004, d);
        float shadow = exp(-max(-d, 0.0) * 28.0) * (1.0 - on_);
        float fibre = smoothstep(0.0, 0.012, d) * (1.0 - smoothstep(0.012, 0.03, d)) * (0.5 + 0.5 * noise2(p * 300.0));
        vec3 c = imgLod(rot2(0.3 * fk) * p * (0.85 + 0.05 * fk) + 0.5 + 0.04 * vec2(sin(fk), cos(fk)), 0.8);
        c = mix(vec3(luma(c)), c, 1.2);
        vec3 layer = c * (0.85 + 0.15 * (0.5 + 0.5 * sin(fk))) * 1.1;
        col *= 1.0 - 0.3 * shadow * on;
        layer = mix(layer, vec3(0.95, 0.93, 0.88), fibre * 0.75);
        col = mix(col, layer, on_ * on);
    }
    finish(col);
}
