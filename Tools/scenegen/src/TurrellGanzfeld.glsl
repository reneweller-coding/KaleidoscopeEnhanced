//@doc
 * @brief TURRELL GANZFELD: a room without edges, only coloured light: two colours breathe into each other across the
 * whole field, the boundary between them so soft that it cannot be found, moving as the music swells, the colours
 * deepening with the bass.  The field is a very slow, very soft mix of two tones -- a broad gradient whose middle wanders
 * with the swell, with a faint glow where the eye rests -- and a fine dither keeps it free of banding.  Saturation and
 * swell are smoothed in a small field of the scene's own.  The two tones are the photo's colour family and a neighbour.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell -> where the two colours meet: the boundary drifts as the music swells (smoothed)
 *   audioBass  -> how deep the colours are (smoothed)
 *
 * Knobs: spanP (how far apart the two tones are), glowP (the resting glow), hueP.
//@params spanP glowP
//@audio audioSwell audioBass
//@state 1 1 60
//@body
/**  The state pass: the swell and the bass smoothed slowly.
 *
 * @return
 *   x the swell, y the bass, 0, 1.
 **/
vec4 stateStep()
{
    vec2 v = clamp(vec2(audioSwell, audioBass), 0.0, 1.0);
    vec2 old = stateFrame < 0.5 ? v : texelFetch(texState, ivec2(0, 0), 0).xy;
    return vec4(mix(old, v, 0.012), 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    vec2 sb = texelFetch(texState, ivec2(0, 0), 0).xy;
    float span = 0.04 + 0.1 * clamp(spanP, 0.0, 1.0);
    float sat = 0.35 + 0.5 * sb.y;
    vec3 a = hsv2rgb(vec3(fh, sat, 0.85)), b = hsv2rgb(vec3(fract(fh + span), sat * 0.9, 0.75));
    float t = 0.02 * sceneTime;
    vec2 dir = vec2(cos(0.3 + 0.4 * sin(t)), sin(0.3 + 0.4 * sin(t)));
    float mid = (sb.x - 0.5) * 0.8 + 0.15 * sin(0.7 * t);
    float s = smoothstep(-1.1, 1.1, dot(p, dir) - mid + 0.25 * (fbm(p * 0.6 + t) - 0.5));
    vec3 col = mix(a, b, s);
    col *= 0.55 + (0.15 + 0.25 * clamp(glowP, 0.0, 1.0)) * exp(-dot(p, p) * 1.5);
    col += (hash21(gl_FragCoord.xy + fract(sceneTime) * 97.0) - 0.5) / 255.0;   // the dither against banding
    finish(col);
}
