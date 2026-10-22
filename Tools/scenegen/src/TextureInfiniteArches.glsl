//@doc
 * @brief TEXTURE INFINITE ARCHES: an endless row of arches receding into the distance, their soffits and faces laid
 * with the photo, and bands of light running through them -- one arch further with every beat; the arches' form turns
 * from round to pointed and back as the harmony moves.  Every arch is a thick frame across the flight, between an inner
 * and an outer curve, drawn from the nearest: a place inside an arch's opening looks on to the next.  The light bands
 * stand every twelve arches and move away by one arch a beat (the beats counted in a small field of the scene's own).
 * A chord change cross-fades the form, as light.  The stone is the photo, calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBeatPhase   -> bands of light run through the arches, one arch a beat (counted)
 *   audioHarmAdvance -> the arches' form: round, pointed or keel (cross-faded)
 *   audioAdvance     -> the walk through the arches (integrated)
 *   audioSwell       -> the bands' brightness
 *
 * Knobs: gapP (the arches' spacing), thickP (the arches' thickness), hueP.
//@params gapP thickP
//@audio audioBeatPhase audioHarmAdvance audioSwell
//@state 1 1 60 32
//@body
/**  The state pass: the beats counted by summing the beat phase's steps.
 *
 * @return
 *   x the beats so far, y the last beat phase, 0, 1.
 **/
vec4 stateStep()
{
    float bp = clamp(audioBeatPhase, 0.0, 1.0);
    if (stateFrame < 0.5) return vec4(0.0, bp, 0.0, 1.0);
    vec4 old = texelFetch(texState, ivec2(0, 0), 0);
    float d = fract(bp - old.y + 1.0);
    if (d > 0.5) d = 0.0;
    return vec4(mod(old.x + d, 4092.0), bp, 0.0, 1.0);
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

/**  How far a place lies inside an arch's opening, for a form.
 *
 * @param w     The place on the arch's plane. (in)
 * @param W     The opening's half width. (in)
 * @param form  The form (0 round, 1 pointed, 2 keel). (in)
 *
 * @return
 *   The distance inside (positive) or outside.
 **/
float opening(vec2 w, float W, float form)
{
    const float Y0 = 0.0;
    float ax = abs(w.x), y = w.y - Y0;
    float side = W - ax;
    float top;
    if (form < 0.5) top = W - length(vec2(ax, max(y, 0.0)));
    else if (form < 1.5) top = 1.45 * W - length(vec2(ax + 0.45 * W, max(y, 0.0) / 1.1));
    else top = 1.3 * W - length(vec2(ax + 0.3 * W, max(y, 0.0))) - 0.15 * W * smoothstep(0.5 * W, 1.1 * W, y) * (1.0 - ax / W);
    return min(side, y < 0.0 ? 9.0 : top);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    const float F = 1.1, W = 0.75, FLOOR = -0.7;
    float D = 0.8 + 0.5 * clamp(gapP, 0.0, 1.0);
    float T = 0.12 + 0.12 * clamp(thickP, 0.0, 1.0);
    float walk = 0.25 * sceneTime + 0.9 * audioAdvance;
    vec4 st = texelFetch(texState, ivec2(0, 0), 0);
    float dl = fract(clamp(audioBeatPhase, 0.0, 1.0) - st.y + 1.0);
    float beats = st.x + (dl < 0.5 ? dl : 0.0);                       // the count carried on to this frame
    float h = max(audioHarmAdvance, 0.0), hk = floor(h), m = smoothstep(0.3, 0.7, fract(h));
    float fA = mod(hk, 3.0), fB = mod(hk + 1.0, 3.0);
    float glow = 0.5 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = vec3(0.0);
    bool hit = false;
    float k0 = floor(walk / D) + 1.0;
    for (int i = 0; i < 14; ++i) {
        float k = k0 + float(i);
        float dz = k * D - walk;
        vec2 w = p * dz / F;
        if (w.y < FLOOR) break;                                       // the floor below
        float px = dz / F / resolution.y;
        float dIn = mix(opening(w, W, fA), opening(w, W, fB), m);
        if (dIn > 0.0) continue;                                      // through the opening to the next arch
        float dOut = mix(opening(w, W + T, fA), opening(w, W + T, fB), m);
        float fade = exp(-0.07 * dz);
        // the band of light: every twelve arches, one arch further each beat
        float band = exp(-pow(mod(k - beats + 6.0, 12.0) - 6.0, 2.0) / 0.6);
        vec3 stone = tone(imgLod(vec2(0.5) + w * vec2(0.35, 0.3) + vec2(0.17, 0.09) * mod(k, 5.0), 1.5), fh);
        if (dOut > 0.0) {
            float edge = exp(-pow(dIn / (1.5 * px + 0.003), 2.0)) + exp(-pow(dOut / (1.5 * px + 0.003), 2.0));
            col = stone * (0.45 + 1.2 * band * glow) * fade + famLight(fh, 0.6, 0.6) * edge * (0.25 + band * glow) * fade;
        } else {
            col = stone * 0.12 * fade + famLight(fh, 0.5, 0.4) * band * glow * 0.12 * fade;   // the wall beside
        }
        hit = true;
        break;
    }
    if (!hit) {
        if (p.y < 0.0) {
            float zf = -FLOOR * F / max(-p.y, 1e-4);
            vec2 fw = vec2(p.x * zf / F, zf + walk);
            col = tone(imgLod(fract(fw * 0.15), 2.0), fh) * 0.15 * exp(-0.07 * zf);
        } else {
            col = famCol(fh, 0.5) * 0.25 * glow;
        }
    }
    finish(col);
}
