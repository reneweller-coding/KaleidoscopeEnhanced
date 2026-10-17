//@doc
 * @brief DE JONG NEBULA: the strange attractor of Peter de Jong's map, x' = sin(a y) - cos(b x), y' = sin(c x) -
 * cos(d y), as a glowing density -- veils, filaments and knots of a nebula that deforms continuously as its four
 * parameters drift.  The density is gathered over time: every step adds a fresh stretch of the orbit and lets the
 * old fade, so the nebula follows its parameters smoothly.  Mirrored left and right; the density reads the photo's
 * colours, the brightest knots their own.
 *
 * Audio Reactivity (structure, not only light):
 *   audioChromaHue  -> two of the parameters follow the key's hue (continuous): the nebula reshapes with the harmony
 *   audioSwell      -> the other two breathe with the swell
 *   audioPhase      -> the palette turns (integrated)
 *   audioKick       -> the knots flash (light)
 *
 * Knobs: shapeP (the base parameter set), glowP (how far the glow spreads), photoP (photo share), hueP.
//@params shapeP glowP photoP
//@audio audioSwell audioKick
//@state 400 225 20
//@body
/**  The attractor's four parameters at this moment.
 *
 * @return
 *   a, b, c, d.
 **/
vec4 params()
{
    vec4 base = mix(vec4(1.4, -2.3, 2.4, -2.1), vec4(-2.7, -0.09, -0.86, -2.2), clamp(shapeP, 0.0, 1.0));
    float h = audioChromaHue;
    return base + vec4(0.25 * sin(h), 0.25 * cos(0.7 * h), 0.2 * (clamp(audioSwell, 0.0, 1.0) - 0.5),
                       0.2 * sin(0.03 * sceneTime));
}

/**  One gathering step for this texel (the state pass): a fresh stretch of the orbit is splatted (as a gather: this
 * texel counts the orbit points near it) and blended into the faded old density.
 *
 * @return
 *   The density, 0, 0, 1.
 **/
vec4 stateStep()
{
    vec2 cell = vec2(stCell()) + 0.5;
    // the texel's place in attractor coordinates: the attractor (about [-2, 2]^2) twice, mirrored at the centre
    vec2 sp = (cell / stateRes - 0.5) * vec2(1.7777778, 1.0);
    vec2 x0 = vec2((abs(sp.x) - 0.4444) * 4.4, sp.y * 4.4);
    vec4 k = params();
    float pix = 4.4 / stateRes.y;
    float sig = pix * (0.8 + 1.5 * clamp(glowP, 0.0, 1.0));
    // a fresh stretch: start from a point drawn from the step number, run in, then gather
    vec2 z = vec2(hash11(stateFrame * 0.731 + 0.1), hash11(stateFrame * 0.373 + 0.7)) * 4.0 - 2.0;
    for (int i = 0; i < 12; ++i) z = vec2(sin(k.x * z.y) - cos(k.y * z.x), sin(k.z * z.x) - cos(k.w * z.y));
    float acc = 0.0;
    for (int i = 0; i < 700; ++i) {
        z = vec2(sin(k.x * z.y) - cos(k.y * z.x), sin(k.z * z.x) - cos(k.w * z.y));
        vec2 d = (z - x0) / sig;
        acc += exp(-dot(d, d));
    }
    float old = stateFrame < 0.5 ? acc : stAt(stCell()).r;
    return vec4(mix(old, acc, 0.12), 0.0, 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    vec2 cc = (p / vec2(1.7777778, 1.0) + 0.5) * stateRes;
    float dens = stLin(cc).r;
    float lit = 1.0 - exp(-dens * 8.0);
    vec2 uv = p * 0.7 + 0.5;
    vec3 photo = imgLod(uv, 1.0);
    vec3 tone = imgPalette(0.2 + 0.6 * lit + 0.03 * audioPhase);
    vec3 col = mix(tone * 1.3, photo * 1.6, 0.3 + 0.5 * clamp(photoP, 0.0, 1.0)) * lit;
    col += mix(tone, vec3(1.0), 0.6) * smoothstep(0.85, 1.0, lit) * 0.3 * (0.5 + clamp(audioKick, 0.0, 1.0));
    col += imgLod(uv, 3.0) * 0.05;
    finish(col);
}
