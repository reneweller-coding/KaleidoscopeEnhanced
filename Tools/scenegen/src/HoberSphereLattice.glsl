//@doc
 * @brief HOBERMAN LATTICE: a field of scissor mechanisms -- crossed bars pinned at their middles and ends, like the
 * Hoberman sphere -- opening and closing together: the rhombi of the lattice widen into squares and fold flat again,
 * the joints sliding.  Several layers at different scales breathe out of step.  The bars carry the photo's colours,
 * the joints shine.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos  -> the breathing over a phrase (continuous)
 *   audioSwell      -> how far the mechanisms open
 *   audioPhase      -> the layers turn against each other (integrated)
 *   audioKick       -> the joints flash (light)
 *
 * Knobs: barsP (bar density), layersP (how many layers), widthP (bar width), hueP.
//@params barsP layersP widthP
//@audio audioSwell audioKick audioPhrasePos
//@body
void main()
{
    vec2 p = screenP();
    float prog = audioPhrasePos > 0.001 ? audioPhrasePos : fract(sceneTime / 16.0);
    int nl = 1 + int(2.99 * clamp(layersP, 0.0, 1.0));
    vec3 col = imgLod(p * 0.6 + 0.5, 2.5) * 0.15;
    for (int k = 0; k < 3; ++k) {
        if (k >= nl) break;
        float fk = float(k);
        float br = 0.5 + 0.5 * sin(6.2831853 * prog + fk * 2.1);
        float ang = (0.25 + 0.55 * br * (0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0))) * 1.5707963;   // the rhombus' angle
        float sc = (5.0 + 6.0 * clamp(barsP, 0.0, 1.0)) * (1.0 + 0.6 * fk);
        vec2 q = rot2(0.02 * audioPhase * (fk + 1.0) * (mod(fk, 2.0) < 0.5 ? 1.0 : -1.0) + fk) * p * sc;
        // two families of bars, at +-ang/2 from the horizontal: the scissor's crossed links
        vec2 e1 = vec2(cos(0.5 * ang), sin(0.5 * ang)), e2 = vec2(cos(0.5 * ang), -sin(0.5 * ang));
        float s1 = dot(q, vec2(-e1.y, e1.x)), s2 = dot(q, vec2(-e2.y, e2.x));
        float w = 0.04 + 0.06 * clamp(widthP, 0.0, 1.0);
        float d1 = abs(fract(s1) - 0.5), d2 = abs(fract(s2) - 0.5);
        float bar = max(smoothstep(w, w * 0.5, d1), smoothstep(w, w * 0.5, d2));
        float joint = smoothstep(w * 2.2, w * 1.2, max(d1, d2));
        vec2 uv = p * 0.7 + 0.5 + 0.05 * vec2(floor(s1), floor(s2)) * 0.1;
        vec3 photo = imgLod(uv, 0.5);
        vec3 tone = imgPalette(0.2 + 0.3 * fk + 0.03 * audioPhase);
        vec3 c = mix(photo * 1.2, tone * 1.3, 0.3) * (0.7 + 0.3 * fk);
        col = mix(col, c, bar * (1.0 - 0.25 * fk));
        col += mix(tone, vec3(1.0), 0.6) * joint * 0.4 * (0.5 + clamp(audioKick, 0.0, 1.0));
    }
    finish(col);
}
