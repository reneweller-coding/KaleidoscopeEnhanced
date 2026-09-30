//@doc
 * @brief CHAININVERTFOLD: a chain of continuous transforms -- a circle inversion of the photo, folded by an iterated fractal kaleidoscope.  Every stage is
 * continuous and the stages are joined by the photo's mirror repeat, so the
 * whole map is seamless; the photograph flows through it endlessly and never
 * repeats.  Rendered as the photo, as a lit relief of it, or as glowing edges
 * or as glowing contour lines (styleP blends through them).  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the flow through the chain (integrated, jump-free)
 *   audioPhase      -> the kaleidoscope turns (integrated)
 *   audioSpread     -> the strength of the distorting stages
 *   audioKick       -> the edges flare (light)
 *   audioMode       -> the tint: cool in minor, warm in major
 *   audioSwell      -> the relief light (slow)
 *
 * Knobs: styleP (photo / relief / glowing edges / contour lines), speedP (flow speed), detailP (texture sharpness), hueP.
//@params styleP speedP detailP
//@audio audioSpread audioKick audioMode audioSwell
//@body
float gT, gSpread;
vec2 chain(vec2 p)
{
    vec2 uv = p * 0.5 + 0.5;
    vec2 cw = vec2(0.5) + 0.15 * vec2(sin(0.017 * sceneTime), cos(0.013 * sceneTime));
    uv = tInvert(uv, cw, 0.25 + 0.1 * gSpread);
    uv = mirrorUV(uv);
    uv = tFold(uv, 0.4 + 0.3 * sin(gT), 1.25, 3.0);
    return uv;
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    gT = (0.03 + 0.06 * clamp(speedP, 0.0, 1.0)) * sceneTime + 0.25 * audioAdvance;
    gSpread = clamp(audioSpread, 0.0, 1.0);
    vec2 grad;
    vec3 ph = imgChain(p, 1.0 - 1.2 * clamp(detailP, 0.0, 1.0), grad);
    float m = luma(ph);
    vec3 photo = max((ph - m) * 1.4 + m, 0.0);
    // Relief: the chain's photo lit from a slowly circling light.
    float la = 0.1 * sceneTime;
    float relief = clamp(0.5 + dot(grad, vec2(cos(la), sin(la))) * 5.0, 0.0, 1.0);
    vec3 reliefC = photo * (0.3 + 1.2 * relief) + vec3(1.0) * pow(relief, 6.0) * (0.1 + 0.3 * swell);
    // Glowing edges: gradient magnitude as neon in the photo's colour.
    float edge = smoothstep(0.02, 0.25, length(grad));
    vec3 neon = glowColour(ph, p, hueP * 0.159) * edge * (1.2 + 1.2 * kick) + photo * 0.06;
    // Isolines of the chain's luma: glowing contour lines.
    float xi = m * 12.0;
    float pxi = fwidth(xi) + 1e-4;
    float iso = smoothstep(pxi * 1.5, 0.0, abs(fract(xi) - 0.5) - 0.5 + pxi * 1.5);
    vec3 isoC = glowColour(ph, p, hueP * 0.159) * iso * (1.0 + kick) + photo * 0.08;
    float st = clamp(styleP, 0.0, 1.0) * 3.0;               // 0 photo, 1 relief, 2 edges, 3 isolines
    vec3 col = mix(photo, reliefC, smoothstep(0.0, 1.0, st));
    col = mix(col, neon, smoothstep(1.0, 2.0, st));
    col = mix(col, isoC, smoothstep(2.0, 3.0, st));
    col *= mix(vec3(0.9, 0.97, 1.08), vec3(1.08, 0.98, 0.9), mode);
    col += glowColour(ph, p, hueP * 0.159) * edge * kick * 0.3 * (1.0 - smoothstep(1.0, 2.0, st));
    finish(col);
}
