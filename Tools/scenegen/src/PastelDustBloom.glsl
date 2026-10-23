//@doc
 * @brief PASTEL DUST BLOOM: pastel dust: soft chalk in layers whose grains let the paper's structure show through; the photo stands in dust, and the grain drifts.  Two sizes of grain, set by the photo's colour and saturation, lie on a paper with a pronounced tooth; the paper's pits stay empty; a soft glow
 * blooms round the heavily dusted places.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the density of the dust
 *   audioAdvance -> the grain drifts (integrated)
 *
 * Knobs: sizeP (the grain size), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    vec2 fc = gl_FragCoord.xy;
    float px = resolution.y / 270.0;
    vec2 drift = vec2(0.4, 0.15) * (0.05 * audioAdvance + 0.06 * sceneTime) * px;
    vec2 q = (fc + drift) / px;
    float gsz = 0.9 + 1.4 * clamp(sizeP, 0.0, 1.0);
    float g1 = noise2(q / gsz * 1.3);
    float g2 = noise2(q / gsz * 3.1 + 7.0);
    float tooth = noise2(q * 0.55) * 0.55 + noise2(q * 1.4 + 3.0) * 0.45;
    vec3 c = imgLod(p * 0.85 + 0.5, 0.8);
    c = mix(vec3(luma(c)), c, 1.35);
    float cover = clamp((0.45 + 0.3 * clamp(audioSwell, 0.0, 1.0)) * (0.5 + luma(c)) , 0.0, 1.0);
    float dust = smoothstep(1.0 - cover - 0.1, 1.0 - cover + 0.1, g1 * 0.6 + g2 * 0.4);
    float pit = smoothstep(0.62, 0.8, tooth);
    dust *= 1.0 - 0.8 * pit;
    vec3 paper = vec3(0.85, 0.82, 0.76) * (0.9 + 0.15 * tooth);
    vec3 glow = imgLod(p * 0.85 + 0.5, 3.0);
    vec3 col = mix(paper, c * 1.15, dust);
    col += glow * 0.12 * cover;
    finish(col * 1.08);
}
