//@doc
 * @brief TEXTURE SAND RIPPLES: a desert seen from above in low evening sun --
 * wind ripples run across the sand in long wavy crests that bend around
 * the dunes (the photograph's large shapes), every crest casting a thin
 * shadow and catching a line of warm light; fine sand streams across the
 * surface in wisps, and the ripples creep slowly downwind.  The sand
 * takes its tint from the photo.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the ripples creep and the sand streams (integrated)
 *   audioSpread     -> ripple wavelength
 *   audioRoughness  -> the crests break up (more defects)
 *   audioMode       -> the light: blue dusk in minor, golden hour in major
 *   audioKick       -> the crest highlights flare (light)
 *   audioSwell      -> the drifting sand wisps (slow)
 *
 * Knobs: duneP (dune height), rippleP (ripple sharpness), tintP (photo tint), hueP.
//@params duneP rippleP tintP
//@audio audioSpread audioRoughness audioMode audioKick audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec2 uv = p * 0.5 + 0.5 + vec2(0.002, 0.001) * sceneTime;
    float T = 0.02 * sceneTime + 0.15 * audioAdvance;
    // Dunes: broad height from the photo.
    float dune = texHeight(uv, 6.0, 0.15) * (0.5 + 1.0 * clamp(duneP, 0.0, 1.0));
    vec2 dg = texGrad(uv, 6.0) * 0.5 * (0.5 + clamp(duneP, 0.0, 1.0));
    // Ripple phase: along the wind, bent by the dunes and some noise.
    vec2 wind = normalize(vec2(1.0, 0.35));
    float wl = 0.03 + 0.03 * clamp(audioSpread, 0.0, 1.0);
    float ph = dot(p, wind) + 0.25 * dune + 0.2 * fbm3(p * 1.2) + 0.03 * rough * fbm3(p * 8.0);
    // Defects: phase jumps smoothed by a slowly varying offset field.
    ph += wl * 0.5 * (fbm3(p * 3.0 + 7.0) - 0.5) * (1.0 + 2.0 * rough);
    float x = ph / wl - T * 3.0;
    float f = fract(x);
    // Asymmetric ripple: gentle stoss slope, steep lee slope.
    float sharp = 0.15 + 0.3 * (1.0 - clamp(rippleP, 0.0, 1.0));
    float h = f < 1.0 - sharp ? f / (1.0 - sharp) : (1.0 - f) / sharp;
    float slope = f < 1.0 - sharp ? 1.0 / (1.0 - sharp) : -1.0 / sharp;
    float px = fwidth(x);
    // Fade the ripples out where they are finer than a pixel.
    float vis = smoothstep(0.5, 0.15, px);
    // Lighting: low sun across the wind.
    vec2 sun = normalize(vec2(0.9, -0.2));
    float lightR = clamp(0.5 + 0.35 * slope * dot(wind, sun) * vis, 0.0, 1.2);
    float lightD = clamp(0.75 + dot(-dg, sun) * 1.6, 0.15, 1.4);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 sunC = mix(vec3(0.75, 0.8, 1.0), vec3(1.2, 0.85, 0.55), mode);
    vec3 shadowC = mix(vec3(0.2, 0.25, 0.45), vec3(0.35, 0.2, 0.25), mode);
    vec3 sand = mix(vec3(0.85, 0.7, 0.5), imgLod(uv, 3.0) * 1.3 + 0.1, 0.4 * clamp(tintP, 0.0, 1.0));
    sand = mix(sand, sand * glowColour(imgLod(uv, 6.0), p, hueP * 0.159) * 1.3, 0.12);
    float lit = lightR * lightD;
    vec3 col = sand * mix(shadowC, sunC, smoothstep(0.2, 0.9, lit));
    // Crest line highlight.
    float crest = exp(-abs(f - (1.0 - sharp)) / (px * 1.5 + 0.01)) * vis;
    col += sunC * crest * (0.12 + 0.35 * kick);
    // Streaming sand wisps.
    float wisp = fbm(vec2(dot(p, wind) * 3.0 - T * 20.0, dot(p, vec2(-wind.y, wind.x)) * 20.0));
    col += sunC * 0.12 * smoothstep(0.55, 0.8, wisp) * (0.3 + 0.9 * swell);
    // Grain.
    col *= 0.95 + 0.05 * noise2(p * 900.0);
    finish(col);
}
