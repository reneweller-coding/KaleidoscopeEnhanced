//@doc
 * @brief CHROMA ROSE WINDOW: a great rose window of twelve petals, each a pane of coloured glass that lights with one
 * pitch class, the stone tracery between them glowing faintly; the whole rose turns to face the key, so the sounding
 * notes' petals swing round as the music modulates.  A petal is a lancet in its twelfth of the circle, pointed at both
 * ends; its brightness is its pitch class's strength, smoothed over a second or so in a small field of the scene's
 * own; the rose turns by the dominant pitch class's hue (continuous).  The glass takes its colours from the photo,
 * calmed into one colour family.
 * The panes' light falls outward into the dark as soft shafts, one for every pane, as bright as its note.
 *
 * Audio Reactivity (structure, not only light):
 *   audioChroma[12]  -> each petal lights with its pitch class (smoothed)
 *   audioChromaHue   -> the rose turns to the key (continuous)
 *   audioSwell       -> the glass' glow
 *
 * Knobs: sizeP (the rose's size), traceryP (the tracery's width), hueP.
//@params sizeP traceryP
//@audio audioChroma[12] audioChromaHue audioSwell
//@state 12 1 60
//@body
/**  The state pass: each pitch class's strength smoothed over a second or so.
 *
 * @return
 *   This pitch class's smoothed strength, 0, 0, 1.
 **/
vec4 stateStep()
{
    int k = stCell().x;
    float c = clamp(audioChroma[k], 0.0, 1.0);
    float old = stateFrame < 0.5 ? c : texelFetch(texState, ivec2(k, 0), 0).r;
    return vec4(mix(old, c, 0.04), 0.0, 0.0, 1.0);
}

/**  The photo's colour calmed toward the colour family.
 *
 * @param photo  The photo's colour. (in)
 * @param fh     The family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 tone(vec3 photo, float fh)
{
    float l = luma(photo);
    return mix(photo * 1.1, famCol(fh, 0.15 + 0.7 * l) * (0.25 + 1.2 * l), 0.45);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    float R = 0.45 + 0.08 * clamp(sizeP, 0.0, 1.0);
    float tw = 0.006 + 0.008 * clamp(traceryP, 0.0, 1.0);
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float rot = audioChromaHue;
    float r = length(p);
    float a = atan(p.y, p.x) - rot;
    const float SEC = 0.5235988;
    float kf = floor(a / SEC);
    int k = int(mod(kf, 12.0));
    float u = (a - (kf + 0.5) * SEC) / (0.5 * SEC);                    // across the petal, -1..1
    float x = r / R;
    // a lancet: pointed at both ends, widest a third of the way out
    float halfW = 0.85 * sin(3.14159265 * clamp((x - 0.28) / 0.67, 0.0, 1.0));
    float inPetal = smoothstep(halfW, halfW - 0.08, abs(u)) * step(0.28, x) * step(x, 0.95);
    float c = texelFetch(texState, ivec2(k, 0), 0).r;
    vec3 glass = tone(imgLod(vec2(cos(a + rot), sin(a + rot)) * 0.3 + 0.5, 2.5), fh);
    vec3 col = famCol(fh, 0.45) * 0.02;
    col = mix(col, glass * (0.22 + 1.3 * c) * glow, inPetal);
    // the window's light falling outward into the dark, a shaft for every pane
    vec2 dir = vec2(cos(a + rot), sin(a + rot));
    float shaft = (0.55 + 0.45 * noise2(dir * 7.0 + vec2(0.0, 0.05 * sceneTime))) * smoothstep(0.97 * R, 1.03 * R, r)
                * exp(-2.2 * (r - R));
    col += glass * (0.3 + 1.5 * c) * shaft * 0.6 * glow;
    // the tracery: the petals' outlines, the rings and the oculus
    float edge = abs(abs(u) - halfW) * r * 0.5 * SEC;
    float trac = exp(-pow(edge / tw, 2.0)) * step(0.28, x) * step(x, 0.97);
    trac += exp(-pow((r - R) / tw, 2.0)) + exp(-pow((r - 0.27 * R) / tw, 2.0));
    trac += exp(-pow((r - 0.15 * R) / (0.6 * tw), 2.0)) * 0.8;
    col += famLight(fh, 0.5, 0.6) * trac * 0.35;
    // the oculus in the middle lights with the whole chord
    float total = 0.0;
    for (int i = 0; i < 12; ++i) total += texelFetch(texState, ivec2(i, 0), 0).r;
    col += famLight(fh, 0.6, 0.7) * smoothstep(0.15 * R, 0.1 * R, r) * total / 12.0 * glow;
    finish(famExpose(col, 2.05, 1.00, 0.00, fh));
}
