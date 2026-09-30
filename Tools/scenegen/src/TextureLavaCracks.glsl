//@doc
 * @brief TEXTURE LAVA CRACKS: the photograph as a cooling lava crust -- its
 * dark lines and hollows split open and glow white-yellow-orange with the
 * molten rock beneath, while the plates between them are the photo itself,
 * darkened and cooling, with a thin red rim where they meet the heat.  The
 * heat flows slowly through the network of cracks like a pulse through
 * veins, the crust drifts and the cracks widen and close in slow waves.
 * An endless field, mirroring without seams; every photo gives its own
 * crack network (the veins of marble, the joints of basalt, the mesh of
 * crackle glaze ...).
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> how far the cracks open (slow)
 *   audioSpread     -> which lines open: wide spectrum opens the fine ones too
 *   audioRoughness  -> the crust's edges boil (fine stetig ripple)
 *   audioMode       -> the glow's temperature: deep red in minor, yellow-white in major
 *   audioAdvance    -> the heat pulse running through the veins (integrated)
 *   audioBass       -> the glow's brightness (light)
 *   audioHigh       -> sparks rising from the hottest cracks (light)
 *
 * Knobs: scaleP (how close), crustP (how much crust vs. open lava),
 * flowP (the pattern of the heat pulse), hueP.
//@params scaleP crustP flowP
//@audio audioSwell audioSpread audioRoughness audioMode audioBass audioHigh
//@body
void main()
{
    vec2 p = screenP();
    float swell = clamp(audioSwell, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);

    float sc = 0.6 + 0.9 * clamp(scaleP, 0.0, 1.0);
    vec2 uv = p * sc + vec2(-0.008, 0.011) * sceneTime + 0.5;
    uv += 0.006 * rough * vec2(fbm3(uv * 40.0 + sceneTime * 0.3) - 0.5, fbm3(uv * 40.0 + 7.0 - sceneTime * 0.3) - 0.5);

    // Where the photo is dark (relative to its surroundings) the crust splits.
    float fine = clamp(audioSpread, 0.0, 1.0);
    float hLocal = luma(imgLod(uv, 1.5 - 0.8 * fine));
    float hWide = luma(imgLod(uv, 5.0));
    float valley = hWide - hLocal;                          // > 0 in dark lines and hollows
    float open = mix(0.05, 0.13, swell) + 0.08 * clamp(crustP, 0.0, 1.0);
    // The cracks breathe in slow waves across the field.
    float breath = 0.5 + 0.5 * sin(dot(uv, vec2(2.3, 1.7)) + fbm3(uv * 2.0) * 3.0 - 0.15 * sceneTime);
    open *= 0.7 + 0.6 * breath;
    float lava = smoothstep(open * 0.55, open, valley);
    float rim = smoothstep(open * 0.05, open * 0.5, valley) - lava;

    // Heat pulse flowing through the network (integrated phase, never snapping).
    float fw = mix(2.0, 7.0, clamp(flowP, 0.0, 1.0));
    float pulse = 0.6 + 0.4 * sin(fw * fbm3(uv * 1.5 + 3.0) * 6.0 - 1.5 * audioAdvance - 0.25 * sceneTime);

    // Lava colour: blackbody-ish ramp, temperature from the mode and the pulse.
    float temp = clamp((0.45 + 0.4 * clamp(audioMode, 0.0, 1.0)) * pulse * (0.8 + 0.4 * bass) * (0.6 + 0.5 * lava), 0.0, 1.2);
    vec3 hot = mix(vec3(0.6, 0.05, 0.0), vec3(1.0, 0.45, 0.05), smoothstep(0.1, 0.5, temp));
    hot = mix(hot, vec3(1.0, 0.92, 0.6), smoothstep(0.5, 1.0, temp));
    hot = mix(hot, hot * imgPalette(0.05 + hueP * 0.159) * 1.6, 0.12);

    // The crust: the photo itself, cooled and dark, a faint heat glow from below.
    vec3 crust = img(mirrorUV(uv)) * 0.22 + imgLod(uv, 4.0) * 0.06;
    crust *= 0.6 + 0.4 * (1.0 - lava);
    vec3 col = crust + vec3(0.25, 0.04, 0.0) * smoothstep(-0.02, 0.06, valley) * 0.6;
    col += vec3(0.9, 0.2, 0.02) * rim * 0.9 * pulse;
    col = mix(col, hot * 2.0, lava);
    // Sparks: round points rising above the hottest cracks.
    vec2 g = uv * 70.0 + vec2(0.0, -sceneTime * 1.5), gi = floor(g), gf = fract(g);
    vec2 gc = 0.25 + 0.5 * hash22(gi);
    float spark = smoothstep(0.12, 0.0, length(gf - gc)) * step(0.93, hash21(gi + 3.0));
    col += vec3(1.0, 0.7, 0.3) * spark * lava * (0.3 + 1.2 * hi);
    finish(col);
}
