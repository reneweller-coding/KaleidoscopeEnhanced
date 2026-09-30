//@doc
 * @brief DEWDROP LENS ARRAY: a field of dew drops on a sheet of glass in
 * front of the photograph -- hundreds of round drops of every size, each a
 * tiny lens that shows the photo behind it sharp, magnified and upside down,
 * with a bright rim of light on one side and a dark refraction ring on the
 * other, while the glass between the drops is fogged and shows the photo
 * soft and pale.  The drops slowly grow, merge and slide, the photo behind
 * drifts, so each drop's miniature keeps changing.  Endless and mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the photo drifts behind the glass (integrated)
 *   audioSpread     -> magnification of the drops
 *   audioSwell      -> how fogged the glass is (slow)
 *   audioRoughness  -> the drops tremble at their rims
 *   audioHigh       -> the highlights on the drops (light)
 *   audioMode       -> the fog tint: cool in minor, warm in major (slow blend)
 *
 * Knobs: sizeP (drop size), densityP (how many), fogP (base fog), hueP.
//@params sizeP densityP fogP
//@audio audioSpread audioSwell audioRoughness audioHigh audioMode
//@body
void main()
{
    vec2 p = screenP();
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float px = 1.0 / resolution.y;
    vec2 drift = vec2(0.01, 0.006) * sceneTime + vec2(0.15, 0.1) * audioAdvance;
    vec2 base = p * 0.9 + 0.5;

    // Fogged glass: the photo soft and pale, tinted.
    vec3 fogTint = mix(vec3(0.85, 0.92, 1.05), vec3(1.05, 0.95, 0.85), clamp(audioMode, 0.0, 1.0));
    vec3 behind = imgLod(base + drift, 4.5);
    float fog = clamp(0.35 + 0.35 * clamp(fogP, 0.0, 1.0) + 0.25 * swell, 0.0, 0.95);
    // The photo is backlit: its colours pushed toward saturation (or a hue
    // field where it is grey), so the drops read as glowing lenses.
    vec3 lit = mix(behind, glowColour(behind, base * 1.3 + drift, hueP * 0.159) * (0.4 + 0.8 * luma(behind)), 0.55) * 1.3;
    vec3 col = mix(lit, vec3(luma(lit)) * 0.5 + 0.25, fog * 0.7) * fogTint * 0.7;
    // Condensation texture on the fog: tiny droplets.
    col *= 0.9 + 0.1 * noise2(p * 400.0);

    // Drops on three size scales, a jittered grid each; nearest drop wins.
    float mag = 0.12 + 0.2 * clamp(audioSpread, 0.0, 1.0);
    float szK = 0.6 + 0.8 * clamp(sizeP, 0.0, 1.0);
    for (int L = 0; L < 3; ++L) {
        float fl = float(L);
        float cell = (0.13 - 0.035 * fl) * szK;
        vec2 slide = vec2(0.0, -0.004 * sceneTime * (1.0 + fl));      // drops creep slowly
        vec2 g = (p + slide) / cell + fl * 7.3;
        vec2 gi = floor(g);
        for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
            vec2 id = gi + vec2(i, j);
            if (hash21(id + fl * 11.0) > (0.3 + 0.35 * clamp(densityP, 0.0, 1.0)) * (1.0 - 0.3 * fl)) continue;
            vec2 c = id + 0.25 + 0.5 * hash22(id + fl);
            float r = (0.18 + 0.22 * hash21(id + 5.0 + fl)) * (0.9 + 0.1 * sin(sceneTime * 0.05 + hash21(id) * 9.0));
            vec2 d = g - c;
            float ang = atan(d.y, d.x);
            float rr = r * (1.0 + 0.04 * clamp(audioRoughness, 0.0, 1.0) * sin(ang * 5.0 + sceneTime * 2.0));
            float dl = length(d) / rr;
            if (dl > 1.05) continue;
            // Lens: inverted, magnified image of the photo behind this drop.
            vec2 cw = (c - fl * 7.3) * cell - slide;              // drop centre in screen space
            vec2 local = (p - cw);
            float z = sqrt(max(1.0 - dl * dl, 0.0));             // drop height (dome)
            vec2 lensUV = cw * 0.9 + 0.5 + drift - local * (1.0 / mag) * (0.6 + 0.6 * z);
            vec3 ph = imgLod(lensUV, 0.5);
            vec3 inDrop = mix(ph, glowColour(ph, lensUV * 1.3, hueP * 0.159) * (0.4 + 0.9 * luma(ph)), 0.55) * 1.6;
            // Rim: dark refraction ring at the edge, bright highlight top-left.
            float ring = smoothstep(0.7, 1.0, dl);
            inDrop *= 1.0 - 0.75 * ring;
            vec2 hdir = normalize(vec2(-0.6, 0.7));
            float hl = smoothstep(0.3, 0.0, length(d / rr - hdir * 0.5)) ;
            inDrop += vec3(1.0) * hl * (0.35 + 0.9 * hi);
            // Caustic: the drop focuses light into a bright crescent at the far side.
            inDrop += vec3(1.0, 0.97, 0.9) * smoothstep(0.25, 0.0, length(d / rr + hdir * 0.62)) * 0.25;
            float aa = px / (cell * rr) * 1.5;
            col = mix(col, inDrop, smoothstep(1.0 + aa, 1.0 - aa, dl));
        }
    }
    finish(col);
}
