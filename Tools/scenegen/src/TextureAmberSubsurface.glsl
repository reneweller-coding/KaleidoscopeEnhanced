//@doc
 * @brief TEXTURE AMBER SUBSURFACE: looking into a great slab of amber held
 * against the light -- warm golden resin glowing from within, deeper
 * where it is thick, full of the photograph's forms like flow lines and
 * inclusions frozen in the honey-coloured depth, tiny air bubbles and
 * crackled sun spangles catching the light; a light source moves slowly
 * behind the slab so the glow wanders and the inner layers shift by
 * parallax.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the light wanders behind (integrated, jump-free)
 *   audioBass       -> the inner glow (light)
 *   audioSpread     -> the depth of the parallax layers
 *   audioMode       -> the resin: cherry-dark in minor, clear honey in major
 *   audioHigh       -> the spangles sparkle (light)
 *   audioSwell      -> the slab's thickness (slow)
 *
 * Knobs: layerP (inner layers), spangleP (sun spangles), bubbleP (air bubbles), hueP.
//@params layerP spangleP bubbleP
//@audio audioBass audioSpread audioMode audioHigh audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float bass = clamp(audioBass, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float T = 0.04 * sceneTime + 0.3 * audioAdvance;
    vec2 L = 0.5 * vec2(sin(T), 0.6 * cos(T * 0.8));             // the light behind
    float thick = 0.6 + 0.6 * swell + 0.3 * fbm3(p * 1.2);
    vec3 honey = mix(vec3(0.55, 0.12, 0.03), vec3(1.0, 0.62, 0.15), mode);
    // Transmitted light: brighter near the light, attenuated by thickness.
    float lightF = exp(-length(p - L) * 1.2) * (0.6 + 0.8 * bass);
    vec3 col = honey * lightF * exp(-thick * 0.6) * 1.8;
    // Inner layers: the photo at several depths, shifted by parallax from the light.
    float nL = 2.0 + 3.0 * clamp(layerP, 0.0, 1.0);
    float par = 0.04 + 0.08 * clamp(audioSpread, 0.0, 1.0);
    for (int k = 0; k < 5; ++k) {
        float fk = float(k);
        float on = smoothstep(fk - 0.5, fk + 0.5, nL - 0.5);
        if (on <= 0.0) break;
        float depth = (fk + 1.0) / 5.0;
        vec2 uv = (p - L * par * depth) * (0.5 + 0.2 * fk) + 0.5 + fk * 0.17;
        vec3 ph = imgK(uv, 1.5 + fk * 0.5);
        float flow = luma(ph);
        float edg = imgKEdge(uv, 2.0 + fk * 0.5);                // structure lines of the kaleidoscoped photo
        // Inclusions: darker forms and flow lines absorb.
        float inc = smoothstep(0.35, 0.15, flow) * 0.5 + 0.3 * exp(-abs(fract(flow * 6.0) - 0.5) * 20.0);
        inc += 0.7 * smoothstep(0.15, 0.6, edg);
        col *= 1.0 - inc * 0.6 * on * (1.0 - depth * 0.5);
        col += honey * glowColour(ph, uv, hueP * 0.159) * 0.04 * on * lightF;
    }
    // Sun spangles: round crackled discs catching the light.
    vec2 sg = p * 8.0;
    vec2 si = floor(sg);
    vec2 sd = fract(sg) - 0.5 - 0.3 * (hash22(si) - 0.5);
    float sr = 0.15 + 0.15 * hash21(si + 2.0);
    float isSp = step(1.0 - 0.18 * clamp(spangleP, 0.0, 1.0), hash21(si + 5.0));
    float sp = smoothstep(sr, sr * 0.8, length(sd)) * isSp;
    float crack = 0.5 + 0.5 * sin(atan(sd.y, sd.x) * 7.0 + hash21(si) * 6.0);
    float tw = 0.6 + 0.4 * sin(sceneTime * (1.0 + hash21(si + 3.0)) + hash21(si) * 30.0);
    // Spangles lie at an angle: only a glint when the light catches them, flat otherwise.
    float catchL = pow(max(0.0, sin(T * 3.0 + hash21(si + 9.0) * 6.28)), 6.0);
    col += honey * vec3(1.2, 1.1, 0.9) * sp * (0.15 + 0.15 * crack) * (0.2 + catchL * (0.8 + 1.2 * hi * tw)) * (0.4 + lightF);
    // Air bubbles: small round bright-rimmed dots.
    vec2 bg = p * 40.0 + 3.0;
    vec2 bi = floor(bg);
    vec2 bd = fract(bg) - 0.25 - 0.5 * hash22(bi);
    float br = 0.08 + 0.1 * hash21(bi + 1.0);
    float bub = step(1.0 - 0.15 * clamp(bubbleP + 0.2, 0.0, 1.2), hash21(bi + 7.0));
    float rim = smoothstep(br * 0.6, br, length(bd)) * smoothstep(br * 1.2, br, length(bd));
    col += vec3(1.0, 0.95, 0.8) * rim * bub * 0.3 * (0.5 + lightF);
    finish(col);
}
