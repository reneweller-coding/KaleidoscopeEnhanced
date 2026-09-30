//@doc
 * @brief THIN SECTION POLARIZED: a rock thin section under the polarising
 * microscope, crossed polars -- a mosaic of mineral grains, each glowing in
 * its own vivid interference colour (the Michel-Levy chart: blues, magentas,
 * golds, greens), with twinned grains striped, and as the stage turns every
 * grain passes through its colours and blacks out at extinction, so the
 * whole mosaic flickers slowly through the spectrum.  The grain pattern is
 * the photograph's structure (its regions become grains); the round field
 * of view fills the frame.  Endless, mirrorable.
 *
 * Interference colour: a grain with retardation R under white light shows
 * the colour of the path difference R (approximated by a sum of cosines
 * over the visible spectrum); its brightness goes as sin^2(2*theta) with
 * the stage angle theta relative to the grain's optical axis.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the stage turns (integrated, jump-free)
 *   audioAdvance    -> the section slides slowly (integrated)
 *   audioSpread     -> grain size
 *   audioMode       -> retardation range: lower orders in minor, higher in major
 *   audioSwell      -> the lamp's brightness (slow)
 *   audioHigh       -> sparkle on grain boundaries (light)
 *
 * Knobs: grainP (grain size), orderP (retardation / colour order), twinP
 * (share of twinned grains), hueP.
//@params grainP orderP twinP
//@audio audioPhase audioSpread audioMode audioSwell audioHigh
//@body
// Interference colour for a path difference R (in units of ~550 nm).
vec3 interference(float R)
{
    vec3 c = vec3(0.0);
    for (int i = 0; i < 6; ++i) {
        float lam = 0.72 + 0.1 * float(i);                  // 0.72 .. 1.22 (relative wavelengths)
        float I = pow(sin(3.14159 * R / lam), 2.0);
        // Rough CIE-like weights of each wavelength into RGB.
        vec3 w = (i < 2) ? vec3(0.1, 0.2, 1.0) : (i < 3) ? vec3(0.1, 0.9, 0.6) : (i < 4) ? vec3(0.5, 1.0, 0.1) : (i < 5) ? vec3(1.0, 0.6, 0.0) : vec3(1.0, 0.1, 0.05);
        c += I * w;
    }
    return c / 2.2;
}

void main()
{
    vec2 p = screenP();
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float sc = (3.0 + 5.0 * clamp(grainP, 0.0, 1.0)) * (0.8 + 0.5 * clamp(audioSpread, 0.0, 1.0));
    vec2 q = p * sc + vec2(0.02, 0.015) * sceneTime + vec2(0.2, 0.1) * audioAdvance;
    // Grains: Voronoi cells, their boundaries bent by the photo's structure.
    vec2 uvp = q / sc * 0.6 + 0.5;
    vec2 warp = (vec2(luma(imgLod(uvp, 4.0)), luma(imgLod(uvp + 0.3, 4.0))) - 0.5) * 1.2;
    vec2 wq = q + warp;
    vec2 gi = floor(wq), gf = fract(wq);
    float f1 = 9.0, f2 = 9.0; vec2 id = vec2(0.0);
    for (int j = -1; j <= 1; ++j) for (int i = -1; i <= 1; ++i) {
        vec2 o = vec2(i, j);
        vec2 c = o + 0.5 + 0.45 * (hash22(gi + o) - 0.5);
        float d = length(gf - c);
        if (d < f1) { f2 = f1; f1 = d; id = gi + o; } else if (d < f2) f2 = d;
    }
    // Each grain: an optical axis angle and a retardation (from the photo's
    // brightness at the grain, so the photo's structure sets the colours).
    float axis = hash21(id) * 3.14159;
    // grain-scale brightness (plus a little strain across the grain)
    float ph = luma(imgLod((id + 0.5 - warp) / sc * 0.6 + 0.5, 5.0)) + 0.06 * (luma(imgLod(uvp, 3.0)) - 0.5);
    float order = 0.6 + 1.6 * clamp(orderP, 0.0, 1.0) + 0.6 * clamp(audioMode, 0.0, 1.0);
    float R = (0.3 + order * (0.3 * hash21(id + 3.0) + 0.7 * ph)) + hueP * 0.05;
    // Twinning: stripes within some grains with the axis flipped.
    float twin = step(1.0 - 0.5 * clamp(twinP, 0.0, 1.0), hash21(id + 7.0));
    vec2 td = vec2(cos(axis + 0.7), sin(axis + 0.7));
    float stripe = smoothstep(0.45, 0.55, fract(dot(wq, td) * 4.0));
    axis += twin * stripe * 1.2;
    // Stage rotation.
    float theta = 0.08 * sceneTime + 0.5 * audioPhase;
    float ext = pow(sin(2.0 * (theta - axis)), 2.0);
    vec3 col = interference(R) * ext * (0.8 + 0.5 * swell) * 1.6;
    // Grain boundaries: thin dark lines with a faint bright relief.
    float bd = f2 - f1;
    float px = sc / resolution.y * 1.5;
    col *= smoothstep(0.0, 0.03 + px, bd);
    col += vec3(1.0) * smoothstep(0.02 + px, 0.0, abs(bd - 0.03)) * (0.05 + 0.3 * hi);
    // The round field of view, larger than the frame, vignetted.
    col *= 1.0 - 0.35 * dot(p, p);
    finish(col);
}
