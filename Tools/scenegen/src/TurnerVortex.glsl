//@doc
 * @brief TURNER VORTEX: a painted maelstrom of light and weather in the
 * manner of J. M. W. Turner's late storms -- a great swirling vortex of
 * luminous haze, gold and white at the heart where the sun burns through,
 * wheeling out into bands of ochre, rust, grey-blue and smoke, the paint
 * laid on in broad soft sweeps and scumbles that follow the swirl, with
 * dark flecks of spray whirled around its edge.  The whole vortex turns
 * slowly and the light at its centre pulses.  The palette leans on the
 * photograph's colours.  Endless, mirrorable (the swirl continues out).
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the vortex turns (integrated, jump-free)
 *   audioAdvance    -> the paint flows along the swirl (integrated)
 *   audioSpread     -> how tightly the vortex winds
 *   audioRoughness  -> the brushwork gets choppier
 *   audioBass       -> the sun at the heart burns brighter (light)
 *   audioMode       -> the palette warms in major
 *
 * Knobs: windP (base winding), sunP (sun strength), smokeP (smoke/spray amount), hueP.
//@params windP sunP smokeP
//@audio audioPhase audioSpread audioRoughness audioBass audioMode
//@body
void main()
{
    vec2 p = screenP();
    float bass = clamp(audioBass, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec2 c = vec2(0.08 * sin(sceneTime * 0.01), 0.05 * cos(sceneTime * 0.013));
    vec2 d = p - c;
    float r = length(d);
    float wind = (1.2 + 1.8 * clamp(windP, 0.0, 1.0)) * (0.8 + 0.5 * clamp(audioSpread, 0.0, 1.0));
    float a = atan(d.y, d.x) - 0.05 * sceneTime - 0.4 * audioPhase;
    // Swirl coordinates: angle twisted by the log radius.
    float sw = a + wind * log(r + 0.05);
    vec2 sq = vec2(cos(sw), sin(sw)) * (0.6 + r);
    float flow = 0.1 * sceneTime + 0.6 * audioAdvance;
    // Brush sweeps: noise stretched along the swirl (seamless via cos/sin).
    float stroke = fbm(sq * 2.2 + vec2(flow, 0.0) + 0.4 * rough * vec2(noise2(sq * 9.0), 0.0));
    float scumble = fbm(sq * 6.0 - vec2(flow * 1.3, 0.0));
    // Palette: gold-white heart -> ochre -> rust -> grey-blue -> smoke.
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 photoC = imgLod(vec2(0.5) + 0.2 * vec2(cos(sw), sin(sw)) * r, 5.0);
    vec3 gold = vec3(1.0, 0.92, 0.65), ochre = vec3(0.85, 0.62, 0.28), rust = vec3(0.6, 0.3, 0.15);
    vec3 slate = mix(vec3(0.35, 0.42, 0.52), vec3(0.5, 0.45, 0.4), mode);
    float t = clamp(r * 1.5 + (stroke - 0.5) * 0.8, 0.0, 1.5);
    vec3 col = mix(gold, ochre, smoothstep(0.1, 0.45, t));
    col = mix(col, rust, smoothstep(0.45, 0.8, t) * (0.5 + 0.5 * stroke));
    col = mix(col, slate, smoothstep(0.7, 1.2, t));
    col = mix(col, col * mix(vec3(1.0), glowColour(photoC, sq, hueP * 0.159) * 1.3, 0.35), 0.6);
    col *= 0.65 + 0.6 * scumble;
    col *= mix(1.0, 0.45, smoothstep(0.35, 1.1, r) * smoothstep(0.35, 0.65, stroke));   // storm-dark bands
    // The sun burning through at the heart.
    float sun = exp(-r * (7.0 - 3.0 * clamp(sunP, 0.0, 1.0))) * (0.7 + 0.8 * bass);
    col += vec3(1.0, 0.95, 0.8) * sun * 1.2;
    // Spray: dark flecks whirled round the edge.
    vec2 fq = vec2(sw * 6.0, r * 20.0 - flow * 3.0);
    float fleck = step(0.93 - 0.05 * clamp(smokeP, 0.0, 1.0), hash21(floor(fq))) * smoothstep(0.4, 0.1, length(fract(fq) - 0.5));
    col = mix(col, vec3(0.12, 0.1, 0.09), fleck * smoothstep(0.3, 0.8, r) * 0.6);
    // Smoke veils darkening the outer band.
    col *= mix(1.0, 0.6 + 0.4 * scumble, clamp(smokeP, 0.0, 1.0) * smoothstep(0.4, 1.0, r));
    finish(col * 1.05);
}
