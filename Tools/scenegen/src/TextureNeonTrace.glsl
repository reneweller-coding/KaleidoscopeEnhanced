//@doc
 * @brief TEXTURE NEON TRACE: the photograph redrawn in neon -- every strong
 * edge of the texture becomes a glowing tube, the tubes bend along the
 * material's own contours (the grain of wood, the cracks in a glaze, the
 * fibres of felt), each with its halo in the dark, and between them the
 * photo itself lies dim and wet, catching the glow as reflections.  Waves
 * of light run through the tubes; the whole field drifts slowly, so the
 * picture is endless and mirrors without seams.  Every photo of the pool
 * gives a different neon drawing.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> which edges light: wide spectrum brings in the fine ones
 *   audioMode       -> the tube colours: cool in minor, warm in major
 *   audioRoughness  -> the tubes shiver (a fine stetig ripple along them)
 *   audioAdvance    -> the light waves running through the tubes (integrated)
 *   audioKick       -> the tubes flare (light)
 *   audioSwell      -> the halos widen (slow)
 *
 * Knobs: scaleP (how close we are), detailP (fine or coarse edges), waveP
 * (the pattern of the light waves), hueP.
//@params scaleP detailP waveP
//@audio audioSpread audioMode audioRoughness audioKick audioSwell audioHigh
//@body
void main()
{
    vec2 p = screenP();
    float swell = clamp(audioSwell, 0.0, 1.0);
    float kick = clamp(audioKick, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);

    // The field: the photo at a scale, drifting slowly (endless, mirrored repeat).
    float sc = 0.7 + 0.9 * clamp(scaleP, 0.0, 1.0);
    vec2 uv = p * sc + vec2(0.013, 0.007) * sceneTime + 0.5;
    uv += 0.004 * rough * vec2(sin(uv.y * 90.0 + sceneTime), cos(uv.x * 90.0 + sceneTime));

    // Edges at two scales; the spectrum's width brings in the fine ones.
    float lodC = 3.5 - 1.5 * clamp(detailP, 0.0, 1.0);
    float eC = texEdge(uv, lodC);
    float eF = texEdge(uv, lodC - 1.0);
    float fine = clamp(audioSpread, 0.0, 1.0);
    float e = max(eC, eF * (0.35 + 0.65 * fine));
    // Tubes: a thin core where the edge is strong, a halo around it.
    // Only the strongest edges become tubes; a slow noise field lets whole
    // regions go dark so the tubes stand in black, not in a grey hatching.
    float gate = smoothstep(0.3, 0.55, fbm3(uv * 1.3 + 0.02 * sceneTime));
    float core = smoothstep(0.55, 0.9, e) * gate;
    float halo = smoothstep(0.25, 0.9, e) * gate * (0.5 + 0.8 * swell);

    // Colour of the tube: from the photo's hue at the broad scale, pushed to
    // neon saturation; minor cooler, major warmer.
    vec3 base = imgLod(uv, 5.0);
    vec3 neon = glowColour(base, uv * 2.0, hueP * 0.159) * 1.3;
    vec3 warm = vec3(1.0, 0.45, 0.25), cool = vec3(0.25, 0.6, 1.0);
    neon = mix(neon, mix(cool, warm, clamp(audioMode, 0.0, 1.0)), 0.25);
    neon = mix(neon, imgPalette(0.3 + hueP * 0.159) * 1.5, 0.15);

    // Waves of light running along the field (integrated, never snapping).
    float wv = mix(3.0, 9.0, clamp(waveP, 0.0, 1.0));
    float wave = 0.55 + 0.45 * sin(dot(uv, vec2(wv, wv * 0.6)) + fbm3(uv * 3.0) * 4.0 - 2.0 * audioAdvance - 0.4 * sceneTime);

    // The photo underneath: dark and wet, catching the neon as reflections.
    vec3 under = imgLod(uv, 1.0) * 0.05 + base * 0.03;
    under += neon * halo * 0.08;
    vec3 col = under;
    col += neon * halo * 0.55 * wave;
    col += mix(neon, vec3(1.0), 0.25) * core * (0.8 + 0.8 * wave) * (1.0 + 0.9 * kick);
    finish(col);
}
