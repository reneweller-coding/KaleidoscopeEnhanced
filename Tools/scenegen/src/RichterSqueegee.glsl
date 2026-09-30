//@doc
 * @brief RICHTER SQUEEGEE: a painting in the manner of Gerhard Richter's
 * squeegee abstractions, endlessly being made -- broad drags of a rubber
 * blade pull layers of wet oil paint across each other, the upper layer
 * torn open into skips and ridges where the paint underneath shows through,
 * streaked in the direction of the pull, the thick paint catching the
 * light on its crests.  The layers are the photograph: each layer is the
 * photo smeared along the pull, so every photo gives its own palette and
 * structure.  New drags keep sweeping across the canvas; the canvas is an
 * endless field that mirrors without seams.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the drags travel (integrated, jump-free)
 *   audioHarmChange -> the tears open wider on chord changes (slow release)
 *   audioSpread     -> the length of the smear (wide spectrum = longer streaks)
 *   audioRoughness  -> the skips get more ragged
 *   audioMode       -> the lower layer warms in major
 *   audioSwell      -> the gloss on the paint ridges (slow)
 *
 * Knobs: layersP (how many layers show), angleP (pull direction), scaleP, hueP.
//@params layersP angleP scaleP
//@audio audioHarmChange audioSpread audioRoughness audioMode audioSwell
//@body
// One layer of paint dragged along direction d: the photo smeared along d
// (sampled along a short line), and its coverage (torn where it skipped).
vec4 paintLayer(vec2 q, vec2 d, float id, float drag, float smear)
{
    // The blade leaves streaks: the paint varies little along the pull, a lot across it.
    vec2 base = q * 0.6 + hash22(vec2(id, 1.0)) * 5.0;
    vec3 c = vec3(0.0);
    for (int k = 0; k < 5; ++k) {
        float t = (float(k) / 4.0 - 0.5) * smear;
        c += imgLod(base + d * (t - drag * 0.3), 1.5);
    }
    c /= 5.0;
    return vec4(c, 1.0);
}

void main()
{
    vec2 p = screenP();
    float swell = clamp(audioSwell, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float sc = 0.8 + 0.8 * clamp(scaleP, 0.0, 1.0);
    vec2 q = p * sc;
    float smear = 0.15 + 0.35 * clamp(audioSpread, 0.0, 1.0);
    float drag = 0.08 * sceneTime + 0.6 * audioAdvance;
    float tear = 0.04 * clamp(audioHarmChange, 0.0, 1.0);
    int nL = 2 + int(clamp(layersP, 0.0, 1.0) * 2.99);

    // Ground layer: the photo, smeared horizontally, the warmest colours.
    float ang0 = (clamp(angleP, 0.0, 1.0) - 0.5) * 0.6;
    vec2 d0 = vec2(cos(ang0), sin(ang0));
    vec4 g = paintLayer(q, d0, 0.0, drag * 0.5, smear);
    vec3 col = g.rgb * mix(vec3(0.95, 1.0, 1.1), vec3(1.15, 1.0, 0.85), clamp(audioMode, 0.0, 1.0));
    float height = 0.0;
    // Upper layers dragged over it, each torn open where the blade skipped.
    for (int i = 1; i < 4; ++i) {
        if (i >= nL) break;
        float fi = float(i);
        float ang = ang0 + (fi - 1.5) * 0.25 + 1.5708 * step(2.5, fi);
        vec2 d = vec2(cos(ang), sin(ang));
        vec4 L = paintLayer(q + vec2(fi * 3.7, fi * 1.3), d, fi, drag * (1.0 + 0.3 * fi), smear);
        vec2 n = vec2(-d.y, d.x);
        float skip = fbm(vec2(dot(q, d) * 1.2 - drag * (1.0 + 0.3 * fi), dot(q, n) * 9.0) + fi * 3.0);
        skip += 0.25 * rough * (noise2(vec2(dot(q, d) * 3.6, dot(q, n) * 54.0) + fi) - 0.5);
        float thr = 0.46 + tear - 0.02 * fi;
        float cov = smoothstep(thr - 0.02, thr + 0.02, skip);
        float ridge = exp(-pow((skip - thr - 0.02) / 0.025, 2.0));
        // Colour of the layer: the photo, pushed toward a distinct hue per layer.
        vec3 lc = mix(L.rgb, glowColour(L.rgb, q * 0.4 + fi, hueP * 0.159 + fi * 0.21) * (0.35 + 0.9 * luma(L.rgb)), 0.45);
        col = mix(col, lc, cov);
        height = mix(height, 0.3 + 0.2 * fi, cov) + ridge * 0.4;
    }
    // Wet oil: gloss on the ridges and the streak texture, lit from the upper left.
    float e = 1.5 / resolution.y;
    float streaks = noise2(vec2(dot(q, d0) * 4.0, dot(q, vec2(-d0.y, d0.x)) * 180.0));
    col *= 0.88 + 0.24 * streaks;
    float hx = dFdx(height), hy = dFdy(height);
    vec3 nrm = normalize(vec3(-hx, -hy, e * 4.0));
    float spec = pow(max(dot(reflect(normalize(vec3(0.5, -0.6, -1.0)), nrm), vec3(0.0, 0.0, 1.0)), 0.0), 20.0);
    col += vec3(1.0) * spec * (0.15 + 0.35 * swell);
    col = mix(vec3(luma(col)), col, 1.3);
    finish(col * 1.1);
}
