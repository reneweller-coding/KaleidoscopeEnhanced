//@doc
 * @brief TEXTURE LIGHT SHAFTS: sunlight breaking through a dark canopy --
 * the photograph's bright gaps become openings in a black screen of
 * leaves (or a cathedral's tracery), and from them shafts of light fan
 * out through hazy air, crossing and merging, dust motes drifting and
 * sparkling inside the beams; the light source wanders slowly, so the
 * rays sweep and turn, and the canopy itself sways.  Endless,
 * mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the canopy sways and drifts (integrated)
 *   audioPhase      -> the light source wanders (integrated)
 *   audioBass       -> the shafts brighten (light)
 *   audioSpread     -> the openings widen
 *   audioMode       -> the light: cool morning in minor, golden in major
 *   audioHigh       -> the dust motes sparkle (light)
 *
 * Knobs: rayP (ray length), hazeP (air haze), dustP (dust motes), hueP.
//@params rayP hazeP dustP
//@audio audioPhase audioBass audioSpread audioMode audioHigh
//@body
float opening(vec2 x)
{
    vec2 uv = x * 0.6 + 0.5 + vec2(0.004, 0.002) * sceneTime + 0.01 * vec2(sin(0.2 * sceneTime + audioAdvance), 0.0);
    // Leafy gaps: smooth noise shaped by the photo's broad light, so every
    // photo gives a canopy with some openings and no texel blocks.
    float l = fbm(x * 6.0 + vec2(0.05 * sceneTime, 0.02 * sceneTime)) + 0.35 * (luma(imgLod(uv, 6.0)) - luma(imgLod(uv, 8.5)));
    return smoothstep(0.68 - 0.06 * clamp(audioSpread, 0.0, 1.0), 0.76, l);
}

void main()
{
    vec2 p = screenP();
    float bass = clamp(audioBass, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    // The light source: wandering beyond the upper part of the screen.
    float la = 0.03 * sceneTime + 0.2 * audioPhase;
    vec2 L = vec2(0.9 * sin(la), 0.75 + 0.25 * cos(la * 0.7));
    // March from the pixel toward the light, collecting openings (radial blur).
    float len = 0.25 + 0.5 * clamp(rayP, 0.0, 1.0);
    vec2 dir = L - p;
    float acc = 0.0, w = 1.0, wsum = 0.0;
    float jit = hash21(gl_FragCoord.xy) * 0.8;                 // spatial dither against banding
    for (int i = 0; i < 28; ++i) {
        float t = (float(i) + 0.5 + jit) / 28.0 * len;
        acc += opening(p + dir * t) * w;
        wsum += w;
        w *= 0.93;
    }
    float shaft = acc / wsum;
    float here = opening(p);
    vec3 lc = mix(vec3(0.75, 0.88, 1.1), vec3(1.2, 0.9, 0.55), mode);
    lc = mix(lc, glowColour(imgLod(p * 0.6 + 0.5, 5.0), p, hueP * 0.159), 0.15);
    float haze = 0.4 + 0.6 * clamp(hazeP, 0.0, 1.0);
    float airN = 0.7 + 0.6 * fbm3(p * 2.0 + vec2(0.03 * sceneTime, 0.0));
    vec3 col = lc * shaft * haze * airN * (0.7 + 0.6 * bass) * 1.1;
    // The canopy: dark leaves, the openings glowing.
    vec2 uv = p * 0.6 + 0.5 + vec2(0.004, 0.002) * sceneTime;
    vec3 leaves = imgLod(uv, 1.5) * 0.06;
    col += mix(leaves, lc * 0.9, here);
    // Dust motes: round, drifting, lit only inside the shafts.
    float dd = clamp(dustP, 0.0, 1.0);
    for (int k = 0; k < 2; ++k) {
        float fk = float(k);
        vec2 g = p * (25.0 + 15.0 * fk) + vec2(0.05 * sceneTime, -0.08 * sceneTime) * (1.0 + fk) + fk * 7.0;
        vec2 gi = floor(g), gf = fract(g);
        vec2 c = 0.2 + 0.6 * hash22(gi + fk) + 0.15 * vec2(sin(sceneTime * 0.4 + hash21(gi) * 6.28), cos(sceneTime * 0.3 + hash21(gi + 1.0) * 6.28));
        float on = step(hash21(gi + 5.0 + fk), 0.35 * dd);
        float d = length(gf - c);
        float tw = 0.6 + 0.4 * sin(sceneTime * (1.5 + hash21(gi + 2.0) * 2.0) + hash21(gi + 3.0) * 6.28);
        col += lc * on * smoothstep(0.1, 0.02, d) * shaft * (0.6 + 1.2 * hi * tw) * 1.5;
    }
    finish(col);
}
