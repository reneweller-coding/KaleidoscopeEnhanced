//@doc
 * @brief BAKER HORSESHOE FOLD: the baker's map as Smale's horseshoe -- the photo is stretched to twice its width,
 * pressed to half its height and the overhang folded back on top, upside down.  Every fold doubles the layers:
 * after one, two strips of the picture; after five, thirty-two; after eight the photo is a fine silk of stripes.
 * Each new fold rolls across the frame as a moving crease; after the eighth, the picture unfolds whole again.  The
 * square is mirrored across the screen, so the stripes run on without seams.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> every change of harmony makes one more fold (the crease rolls across while it happens)
 *   audioSwell      -> the stripes' slow drift
 *   audioPhase      -> the palette of the creases turns (integrated)
 *   audioKick       -> the crease flashes (light)
 *
 * Knobs: angleP (the direction the folds run), scaleP (the square's size on screen), hueP.
//@params angleP scaleP
//@audio audioSwell audioKick audioHarmAdvance
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

/**  The photo coordinate under n inverse baker folds (the tent version: the right half is folded back on top).
 *
 * @param q  The point in the unit square. (in)
 * @param n  The number of folds to undo. (in)
 *
 * @return
 *   The point of the plain photo it came from.
 **/
vec2 unfold(vec2 q, float n)
{
    for (int i = 0; i < 8; ++i) {
        if (float(i) >= n) break;
        q = q.y < 0.5 ? vec2(0.5 * q.x, 2.0 * q.y) : vec2(1.0 - 0.5 * q.x, 2.0 * (1.0 - q.y));
    }
    return q;
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    float swellClock = texelFetch(texState, ivec2(0, 0), 0).r;   // seconds, run faster as the music swells
    vec2 p = screenP();
    float ang = 1.5707963 * floor(clamp(angleP, 0.0, 0.999) * 2.0) + 0.6 * sin(0.01 * sceneTime);
    float sc = 0.8 + 0.6 * clamp(scaleP, 0.0, 1.0);
    vec2 r = rot2(ang) * p * sc;
    vec2 q = 1.0 - abs(fract(r * 0.5 + 0.5) * 2.0 - 1.0);       // the unit square, mirrored across the screen
    float h = max(audioHarmAdvance, 0.0);
    float lvl = mod(floor(h), 9.0);
    float f = smoothstep(0.15, 0.85, fract(h));                 // how far the new crease has rolled
    // the crease rolls along the stretched direction; behind it the next fold is already made
    float front = r.x * 0.5 + 0.5;
    float past = smoothstep(f - 0.03, f + 0.03, 1.0 - fract(front));
    float nA = lvl, nB = mod(lvl + 1.0, 9.0);
    vec2 drift = vec2(0.0, 0.004 * swellClock);
    vec3 a = imgLod(unfold(q, nA) + drift, 0.4), b = imgLod(unfold(q, nB) + drift, 0.4);
    vec3 col = mix(b, a, past);
    float crease = exp(-pow((1.0 - fract(front) - f) * 30.0, 2.0)) * step(0.02, f) * step(f, 0.98);
    vec3 tone = imgPalette(0.3 + 0.03 * audioPhase);
    col += mix(tone, vec3(1.0), 0.5) * crease * (0.4 + 0.8 * clamp(audioKick, 0.0, 1.0));
    finish(col);
}
