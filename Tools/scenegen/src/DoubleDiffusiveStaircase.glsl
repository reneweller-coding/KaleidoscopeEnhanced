//@doc
 * @brief DOUBLE-DIFFUSIVE STAIRCASE: warm salty water over cold fresh water -- because heat diffuses faster than salt,
 * the column breaks into a staircase of well-mixed layers separated by thin interfaces, and through each interface
 * hang salt fingers, thin and swaying.  The staircase is mirrored up and down so it fills the frame; each layer
 * holds its own band of the photo, gently stirred inside; new steps form and old ones merge over the phrase.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the heat flux: the fingers grow longer and sway faster
 *   audioPhrasePos  -> over a phrase one more step forms (the staircase glides to more, finer layers)
 *   audioAdvance    -> the fingers' sway (integrated)
 *   audioKick       -> the interfaces flash (light)
 *
 * Knobs: stepsP (the base number of steps), fingerP (finger spacing), stirP (the stirring inside a layer), hueP.
//@params stepsP fingerP stirP
//@audio audioSwell audioKick audioPhrasePos
//@state 1 1 60 32
//@body
/**  The state pass: a clock whose speed follows the swell, summed step by step (so its speed changes, never its
 * reading).
 *
 * @return
 *   The clock, 0, 0, 1.
 **/
vec4 stateStep()
{
    float prev = stateFrame < 0.5 ? 0.0 : texelFetch(texState, ivec2(0, 0), 0).r;
    return vec4(prev + (0.5 + clamp(audioSwell, 0.0, 1.0)) / 60.0, 0.0, 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    float swellClock = texelFetch(texState, ivec2(0, 0), 0).r;   // seconds, run faster as the music swells
    vec2 p = screenP();
    float prog = audioPhrasePos > 0.001 ? audioPhrasePos : fract(sceneTime / 16.0);
    float steps = 4.0 + 4.0 * clamp(stepsP, 0.0, 1.0) + smoothstep(0.3, 0.9, prog);
    // the staircase, mirrored at the centre: a slow wave bends the layers so they never stand quite still
    float y = abs(p.y) * 2.0 + 0.03 * sin(2.0 * p.x + 0.1 * sceneTime);
    float ys = y * steps;
    float li = floor(ys), ly = fract(ys);
    // interfaces: thin bands at each step, with fingers hanging through them
    float k = 6.2831853 * (8.0 + 12.0 * clamp(fingerP, 0.0, 1.0));
    float sway = 0.02 * audioAdvance + 0.2 * swellClock;
    float len = 0.12 + 0.2 * clamp(audioSwell, 0.0, 1.0);
    float dI = min(ly, 1.0 - ly);                               // distance to the nearest interface (in layers)
    float fx = p.x * k + 0.6 * sin(p.x * 3.0 + li * 1.7 + 0.3 * sway) + 0.4 * sin(sway + li) * (ly - 0.5);
    float finger = smoothstep(0.35, 0.9, 0.5 + 0.5 * cos(fx)) * smoothstep(len, 0.0, dI);
    float iface = exp(-dI * dI * 900.0);
    // inside a layer: its own band of the photo, stirred by a slow roll
    float st = (0.006 + 0.02 * clamp(stirP, 0.0, 1.0));
    vec2 roll = st * vec2(sin(ly * 6.2831853 + 0.3 * sceneTime + li), cos(p.x * 4.0 + 0.2 * sceneTime + li));
    vec2 uv = vec2(p.x * 0.7 + 0.5, (li + 0.5) / steps * 0.9 + (ly - 0.5) * 0.08) + roll;
    vec3 band = imgLod(uv, 0.6);
    vec3 below = imgLod(uv + vec2(0.0, 0.9 / steps), 0.6);      // the layer the fingers reach into
    vec3 tone = imgPalette(li / steps + 0.03 * audioPhase);
    // the fingers: lit strands of the layer below hanging into this one, with dark gaps between them
    float shade = 0.85 + 0.15 * sin(li * 2.1);
    vec3 col = band * shade * (1.0 - 0.45 * smoothstep(len * 0.9, 0.0, dI) * (1.0 - finger));
    col = mix(col, below * 1.35 + tone * 0.15, finger * 0.85);
    col += mix(tone, vec3(1.0), 0.5) * iface * (0.35 + 0.6 * clamp(audioKick, 0.0, 1.0));
    finish(col);
}
