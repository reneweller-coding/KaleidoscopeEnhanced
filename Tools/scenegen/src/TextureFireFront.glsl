//@doc
 * @brief TEXTURE FIRE FRONT: the photograph burning like paper held over a
 * flame -- a ragged front of glowing embers eats its way across the
 * picture, the paper browning and curling ahead of it, the burnt area
 * behind turning to grey-black ash with the image still faintly printed
 * in it, sparks rising from the front; then the ash cools and the picture
 * returns (as if regrowing) while fronts start elsewhere.  Endless,
 * mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the fronts move (integrated, jump-free)
 *   audioSpread     -> the front width (the glowing band)
 *   audioBass       -> the embers glow (light)
 *   audioMode       -> the flame: deep red in minor, bright orange in major
 *   audioRoughness  -> the front gets more ragged
 *   audioHigh       -> sparks fly (light)
 *
 * Knobs: burnP (burnt share of the picture), charP (browning ahead), ashP (image in the ash), hueP.
//@params burnP charP ashP
//@audio audioSpread audioBass audioMode audioRoughness audioHigh
//@body
void main()
{
    vec2 p = screenP();
    float bass = clamp(audioBass, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    vec2 uv = p * 0.6 + 0.5 + vec2(0.002, 0.001) * sceneTime;
    vec3 ph = imgLod(uv, 0.6);
    // Burn field: a slow travelling field; the front is its isoline.
    float T = 0.03 * sceneTime + 0.2 * audioAdvance;
    float fld = fbm3(p * 1.2 + vec2(T, 0.3 * T)) + 0.5 * fbm3(p * 2.5 - vec2(0.2 * T, T));
    fld += (0.05 + 0.12 * rough) * (fbm(p * 12.0) - 0.5);
    fld += 0.12 * (luma(ph) - 0.5);                            // bright paper burns a little later
    float lvl = 0.55 + 0.35 * (clamp(burnP, 0.0, 1.0) - 0.5) + 0.12 * sin(0.07 * sceneTime);
    float d = fld - lvl;                                       // < 0 burnt, > 0 intact
    float bw = 0.015 + 0.03 * clamp(audioSpread, 0.0, 1.0);
    float ember = exp(-d * d / (bw * bw));
    float ahead = smoothstep(0.12 + 0.1 * clamp(charP, 0.0, 1.0), 0.0, d) * step(0.0, d);
    float burnt = smoothstep(0.0, -bw * 1.5, d);
    // Intact paper browns ahead of the front.
    vec3 paper = mix(ph, ph * vec3(0.7, 0.45, 0.2) * 1.1, ahead * 0.8);
    // Ash: grey-black, the image faintly printed, cooling to grey.
    float cool = smoothstep(0.0, -0.25, d);
    vec3 ash = mix(vec3(0.08, 0.07, 0.07), vec3(0.2, 0.2, 0.21), cool) * (0.7 + 0.6 * luma(ph) * clamp(ashP + 0.3, 0.0, 1.3));
    ash *= 0.85 + 0.15 * noise2(p * 200.0);
    vec3 col = mix(paper, ash, burnt);
    // Embers along the front.
    vec3 fl = mix(vec3(0.9, 0.15, 0.02), vec3(1.0, 0.55, 0.1), mode);
    float flick = 0.7 + 0.3 * noise2(p * 40.0 + vec2(0.0, sceneTime * 3.0));
    col += fl * ember * flick * (1.2 + 1.2 * bass);
    col += vec3(1.0, 0.85, 0.5) * pow(ember, 4.0) * flick * (0.5 + 0.8 * bass);
    // Glowing specks just behind the front (round embers still alive in the ash).
    vec2 eg = p * 160.0;
    vec2 ei = floor(eg);
    float sp = smoothstep(0.35, 0.1, length(fract(eg) - 0.25 - 0.5 * hash22(ei))) * step(0.93, hash21(ei)) * smoothstep(-0.08, -0.01, d) * burnt;
    col += fl * sp * 0.8 * flick;
    // Sparks: round, rising from the front.
    vec2 sg = vec2(p.x * 40.0, p.y * 40.0 - sceneTime * 2.0);
    vec2 si = floor(sg), sf = fract(sg);
    vec2 sc = 0.25 + 0.5 * hash22(si);
    float near = exp(-max(d, 0.0) * 25.0) * step(-0.05, d);
    float spark = smoothstep(0.2, 0.0, length(sf - sc)) * step(0.9, hash21(si + 3.0)) * near;
    col += vec3(1.0, 0.7, 0.3) * spark * (0.3 + 1.5 * hi);
    col = mix(col, col * glowColour(ph, p, hueP * 0.159) * 1.3, 0.05);
    finish(col);
}
