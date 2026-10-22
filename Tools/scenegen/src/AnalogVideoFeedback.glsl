//@doc
 * @brief ANALOG VIDEO FEEDBACK: a camera filming its own monitor: every frame shows the last one again, turned a
 * little and shrunk a little, so the picture falls into a spiral tunnel of copies of itself, each copy's colours
 * drifting a shade further, with the phosphor's afterglow and bloom.  The state field holds the monitor's picture;
 * each step it takes its own picture back through the camera -- rotated about the middle, zoomed, brightened a
 * touch and faded -- and the photo seeds the middle of the picture, so there is always something to feed back.
 * The colours drift within one colour family from the photo, never round the whole wheel.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the camera's turn against the monitor (integrated): the spiral winds on
 *   audioSwell   -> the zoom: louder music, a deeper tunnel
 *   audioOnset   -> the seed in the middle flares
 *
 * Knobs: turnP (how far the camera is turned), driftP (how far the colours drift per copy), hueP.  Distinct from
 * FeedbackKaleidoscope, which mirrors; this one turns and zooms.
//@params turnP driftP
//@audio audioSwell audioOnset
//@state 480 270 30
//@body
/**  One step of the feedback: the monitor's picture back through the camera, turned and zoomed, and the seed.
 *
 * @return
 *   The new picture.
 **/
vec4 stateStep()
{
    vec2 cell = vec2(stCell()) + 0.5;
    vec2 p = (cell / stateRes - 0.5) * vec2(stateRes.x / stateRes.y, 1.0);
    float fh = famHue();
    float ang = (0.025 + 0.05 * clamp(turnP, 0.0, 1.0)) * (1.0 + 0.3 * sin(0.2 * audioAdvance));
    float zoom = 0.955 - 0.03 * clamp(audioSwell, 0.0, 1.0);
    vec2 src = rot2(ang) * p * zoom;
    vec2 sc = (src / vec2(stateRes.x / stateRes.y, 1.0) + 0.5) * stateRes;
    vec4 old = stateFrame < 0.5 ? vec4(0.0) : stLin(sc);
    // the copy: a touch brighter at its middle (the monitor's bloom), faded overall, its colour drifted in the family
    float drift = 0.02 + 0.05 * clamp(driftP, 0.0, 1.0);
    vec3 c = old.rgb * 0.965;
    float l = luma(c);
    c = mix(c, famCol(fh, fract(0.5 + 4.0 * drift * sin(0.05 * sceneTime) + l * 0.3)) * l * 1.6, 0.06);
    // the seed: the photo in the middle of the picture, glowing
    float r = length(p);
    vec3 seed = imgLod(p * 1.4 + 0.5, 1.5);
    float sl = luma(seed);
    vec3 sc3 = mix(seed * 1.2, famCol(fh, 0.2 + 0.6 * sl) * (0.4 + 1.0 * sl), 0.5);
    float sw = smoothstep(0.18, 0.08, r) * (0.18 + 0.4 * clamp(audioOnset, 0.0, 1.0));
    c = mix(c, sc3, sw);
    return vec4(c, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    vec2 cc = (p / vec2(stateRes.x / stateRes.y, 1.0) + 0.5) * stateRes;
    vec3 c = stLin(cc).rgb;
    // the monitor's phosphor: a soft bloom round the bright parts and faint scan lines
    vec3 bloom = stLin(cc + vec2(1.5, 0.0)).rgb + stLin(cc - vec2(1.5, 0.0)).rgb + stLin(cc + vec2(0.0, 1.5)).rgb
                 + stLin(cc - vec2(0.0, 1.5)).rgb;
    vec3 col = c * 1.1 + bloom * 0.06;
    col *= 0.94 + 0.06 * sin(gl_FragCoord.y * 3.14159265 * 0.5);
    finish(col);
}
