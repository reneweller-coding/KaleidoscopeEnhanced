//@doc
 * @brief TEXTURE MICA GLITTER: a slab of mica-flecked stone -- dark
 * granite-like ground (the photograph's forms) dense with flakes of mica
 * that lie in layers at slightly different angles, so whole sheets of them
 * flash golden or silver together as a light sweeps across, the
 * flashes rolling over the stone in waves.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the light sweeps (integrated, jump-free)
 *   audioSpread     -> sheet size
 *   audioKick       -> the flashes flare (light)
 *   audioMode       -> mica: silver in minor, gold in major
 *   audioHigh       -> single flakes twinkle (light)
 *   audioSwell      -> the stone's own colour (slow)
 *
 * Knobs: flakeP (flake density), sheetP (sheet alignment), stoneP (photo as the stone), hueP.
//@params flakeP sheetP stoneP
//@audio audioSpread audioKick audioMode audioHigh audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec2 uv = p * 0.5 + 0.5;
    vec3 ph = imgK(uv, 1.0);
    // The stone's relief: the kaleidoscoped photo embossed by the sweeping light.
    float relief = imgKRelief(uv, 2.0, vec2(cos(0.08 * sceneTime + 0.55 * audioAdvance), sin(0.06 * sceneTime)));
    vec3 stone = mix(vec3(0.08, 0.08, 0.09) * (0.6 + 0.8 * fbm3(p * 8.0)), ph * 0.3, clamp(stoneP, 0.0, 1.0)) * (0.7 + 0.6 * swell);
    stone *= 0.4 + 1.2 * relief;
    vec3 col = stone;
    vec3 mica = mix(vec3(0.85, 0.88, 0.92), vec3(1.0, 0.8, 0.4), mode);
    float T = 0.08 * sceneTime + 0.55 * audioAdvance;
    // Sheets: patches of aligned flakes; each sheet's normal angle.
    float ss = 2.0 + 3.0 * (1.0 - clamp(audioSpread, 0.0, 1.0));
    float sheetA = fbm3(p * ss + 3.0) * 6.2831853;
    float align = 0.4 + 0.6 * clamp(sheetP, 0.0, 1.0);
    // Flakes: small irregular platelets (Voronoi cells), normal = sheet normal + jitter.
    vec2 g = p * 55.0;
    vec2 gi = floor(g), gf = fract(g);
    float f1 = 9.0, f2 = 9.0; vec2 id = gi;
    for (int y = -1; y <= 1; ++y) for (int x = -1; x <= 1; ++x) {
        vec2 o = vec2(x, y);
        vec2 c = o + 0.1 + 0.8 * hash22(gi + o);
        float d = length(gf - c);
        if (d < f1) { f2 = f1; f1 = d; id = gi + o; } else if (d < f2) f2 = d;
    }
    float isFlake = step(hash21(id + 2.0), 0.35 + 0.5 * clamp(flakeP, 0.0, 1.0));
    float na = sheetA + (hash21(id) - 0.5) * 6.2831853 * (1.0 - align);
    // The light's direction rolls; a flake flashes when aligned with it.
    float la = T * 1.5 + 0.8 * sin(dot(p, vec2(0.5, 0.3)) + T);
    float flash = pow(max(0.0, cos(na - la)), 40.0);
    float tw = pow(max(0.0, sin(sceneTime * 3.0 + hash21(id + 5.0) * 40.0)), 16.0) * hi;
    float body = smoothstep(0.0, 0.1, f2 - f1);
    col += mica * isFlake * body * (0.06 + (0.9 + 1.8 * kick) * flash + tw);
    col = mix(col, col * glowColour(ph, p, hueP * 0.159) * 1.2, 0.05);
    finish(col);
}
