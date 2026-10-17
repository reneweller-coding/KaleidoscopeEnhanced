//@doc
 * @brief LIGHT LEAK CHOREOGRAPHY: light leaking into a camera -- soft coloured flares, halos and streaks drifting over
 * the photo, choreographed: over a phrase they gather in from the edges, sweep across in arcs, bloom where they
 * meet, and fade out at the phrase's end to begin again from other edges.  The photo stays, the light dances over
 * it, tinted from the photo's own colours.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos  -> the choreography's progress (continuous over a phrase)
 *   audioSwell      -> the leaks' strength
 *   audioKick       -> the blooms flash (light)
 *
 * Knobs: leaksP (how many leaks), sizeP (their size), streakP (how much they streak), hueP.
//@params leaksP sizeP streakP
//@audio audioSwell audioKick audioPhrasePos
//@body
void main()
{
    vec2 p = screenP();
    float prog = audioPhrasePos > 0.001 ? audioPhrasePos : fract(sceneTime / 16.0);
    float phr = floor(sceneTime / 16.0);
    vec2 uv = p * 0.7 + 0.5;
    vec3 photo = imgLod(uv, 0.4);
    int n = 3 + int(5.0 * clamp(leaksP, 0.0, 1.0));
    float sz = 0.22 + 0.3 * clamp(sizeP, 0.0, 1.0);
    vec3 light = vec3(0.0);
    for (int i = 0; i < 8; ++i) {
        if (i >= n) break;
        float fi = float(i);
        // each leak enters from an edge, sweeps an arc through the frame and leaves
        float a0 = 6.2831853 * hash11(fi * 3.1 + phr * 0.7);
        vec2 from = 1.3 * vec2(cos(a0), 0.6 * sin(a0));
        vec2 to = -from.yx * vec2(1.0, -1.0) * 0.8;
        float s = smoothstep(0.0, 1.0, clamp((prog - 0.1 * fi / float(n)) * 1.2, 0.0, 1.0));
        vec2 mid = 0.5 * (from + to) + 0.4 * vec2(-(to - from).y, (to - from).x) * (hash11(fi * 5.7) - 0.5);
        vec2 c = mix(mix(from, mid, s), mix(mid, to, s), s);
        vec2 vel = normalize(mix(mid - from, to - mid, s) + 1e-4);
        vec2 d = p - c;
        // a soft blob stretched along its path (the streak)
        float st = 1.0 + 3.0 * clamp(streakP, 0.0, 1.0);
        vec2 dl = vec2(dot(d, vel) / st, dot(d, vec2(-vel.y, vel.x)));
        float b = exp(-dot(dl, dl) / (sz * sz));
        float fade = sin(3.14159265 * s);
        vec3 tint = imgPalette(hash11(fi * 2.3 + phr) + 0.03 * audioPhase);
        tint /= max(max(tint.r, tint.g), max(tint.b, 0.05));
        light += tint * b * fade;
    }
    float str = 0.9 + 0.8 * clamp(audioSwell, 0.0, 1.0);
    // screen blend: the light brightens the photo without washing it out
    vec3 l = light * str * (0.9 + 0.4 * clamp(audioKick, 0.0, 1.0));
    vec3 col = 1.0 - (1.0 - photo * 0.85) * (1.0 - clamp(l, 0.0, 1.0) * 0.95);
    finish(col);
}
