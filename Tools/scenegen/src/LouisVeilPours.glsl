//@doc
 * @brief LOUIS VEIL POURS: after Morris Louis's "Veils" -- translucent sheets
 * of thinned acrylic poured over one another, each a flowing curtain of
 * colour with soft, tide-marked edges, the layers glazing into deeper
 * colours where they overlap; the pours keep coming, each veil flowing
 * across and slowly fading as newer ones cover it.  The colours come from
 * the photograph; the raw canvas shows where no paint reached.  Endless,
 * mirrorable (the veils flow in several directions, no gravity edge).
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the pours flow (integrated, jump-free)
 *   audioHarmChange -> a new veil begins (smoothed)
 *   audioSpread     -> veil width
 *   audioRoughness  -> the tide lines get more ragged
 *   audioMode       -> the palette warms in major
 *   audioSwell      -> saturation (slow)
 *
 * Knobs: layersP (how many veils), glazeP (transparency), canvasP (raw canvas), hueP.
//@params layersP glazeP canvasP
//@audio audioHarmChange audioSpread audioRoughness audioMode audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float swell = clamp(audioSwell, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float T = 0.03 * sceneTime + 0.3 * audioAdvance + 0.1 * clamp(audioHarmChange, 0.0, 1.0);
    vec3 canvas = vec3(0.9, 0.87, 0.8) * (0.95 + 0.05 * noise2(p * 300.0));
    vec3 col = canvas;
    int nV = 4 + int(clamp(layersP, 0.0, 1.0) * 3.99);
    float glaze = 0.5 + 0.4 * clamp(glazeP, 0.0, 1.0);
    for (int k = 0; k < 8; ++k) {
        if (k >= nV) break;
        float fk = float(k);
        float life = fract(T + fk / float(nV));
        float gen = floor(T + fk / float(nV));
        float id = gen * 7.0 + fk;
        // A veil: a fan of many narrow bands of one colour, flowing out from
        // a source line and spreading, striated along the flow.
        float ang = hash11(id * 1.7) * 6.2831853;
        vec2 dir = vec2(cos(ang), sin(ang));
        vec2 nrm = vec2(-dir.y, dir.x);
        vec2 src = (hash22(vec2(id, 3.0)) - 0.5) * 1.4 - dir * 0.6;
        vec2 d = p - src;
        float along = dot(d, dir);
        float across = dot(d, nrm) / (0.35 + 0.35 * max(along, 0.0)) ;         // the fan spreads
        float width = 0.5 + 0.4 * clamp(audioSpread, 0.0, 1.0);
        float inFan = smoothstep(width, width * 0.55, abs(across + 0.15 * fbm3(vec2(along * 2.0, id))));
        // Striations: thin streams of thicker pigment inside the veil.
        float stri = 0.65 + 0.35 * fbm3(vec2(across * 9.0 + id, along * 0.6 + rough * 2.0 * noise2(vec2(along * 8.0, across * 8.0))));
        float reach = life * 3.2 + 0.2;
        float front = smoothstep(reach, reach - 0.25 - 0.1 * noise2(vec2(across * 6.0, id)), along) * smoothstep(-0.4, 0.1, along + 0.2 * fbm3(vec2(across * 3.0, id + 9.0)));
        float a = inFan * front * smoothstep(0.0, 0.05, life) * smoothstep(1.0, 0.6, life);
        float tide = smoothstep(width * 0.85, width, abs(across)) * inFan;
        vec3 ph = imgLod(vec2(id * 0.137, id * 0.091) + 0.5, 5.0);
        float h = (satOf(ph) > 0.2 ? hue_of(ph) : hueP * 0.159) + 0.14 * fk;
        vec3 dye = hsv2rgb(vec3(fract(h + 0.05 * clamp(audioMode, 0.0, 1.0)), 0.5 + 0.35 * swell, 1.0));
        dye = mix(vec3(1.0), dye, stri) * (1.0 - 0.2 * tide);
        col = mix(col, col * mix(vec3(1.0), dye, glaze + 0.25), a);
    }
    col = mix(col, canvas, 0.12 * clamp(canvasP, 0.0, 1.0));
    finish(col * 1.05);
}
