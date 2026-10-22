//@doc
 * @brief PURE BOKEH STREAMS: streams of out-of-focus lights drift through three depths -- big soft discs near, smaller
 * ones behind, tiny bright points far away -- each disc ringed brighter at its rim and squeezed into a cat's eye toward
 * the picture's edges, as a lens does; each depth glows with its own band of the music.  A layer is a jittered grid of
 * lights drifting with the music's drive, faster the nearer; a disc is the overlap of the lens's opening with its
 * shifted exit pupil, so toward the edges it narrows to a lemon; the near layer listens to the bass, the middle to the
 * mids, the far to the highs (smoothed in a small field of the scene's own).  Shades of one colour family from the
 * photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBass/Mid/High -> each depth glows with its band (smoothed)
 *   audioAdvance       -> the streams drift (integrated)
 *
 * Knobs: sizeP (the discs' size), countP (how many lights), hueP.
//@params sizeP countP
//@audio audioBass audioMid audioHigh
//@state 1 1 60
//@body
/**  The state pass: the three bands smoothed.
 *
 * @return
 *   The smoothed bass, middle and highs, 1.
 **/
vec4 stateStep()
{
    vec3 b = clamp(vec3(audioBass, audioMid, audioHigh), 0.0, 1.0);
    vec3 old = stateFrame < 0.5 ? b : texelFetch(texState, ivec2(0, 0), 0).rgb;
    return vec4(mix(old, b, 0.05), 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    vec3 bands = texelFetch(texState, ivec2(0, 0), 0).rgb;
    float drift = 0.04 * sceneTime + 0.2 * audioAdvance;
    vec3 col = famCol(fh, 0.4) * 0.02;
    for (int k = 2; k >= 0; --k) {
        float fk = float(k);
        float cellS = (0.34 - 0.1 * fk) * (1.2 - 0.4 * clamp(countP, 0.0, 1.0));
        float R = cellS * (0.32 + 0.12 * clamp(sizeP, 0.0, 1.0));
        vec2 q = p + vec2(drift * (1.6 - 0.5 * fk), 0.15 * drift * sin(fk));
        vec2 g = q / cellS;
        float band = k == 0 ? bands.x : k == 1 ? bands.y : bands.z;
        for (int dj = -1; dj <= 1; ++dj)
            for (int di = -1; di <= 1; ++di) {
                vec2 cell = floor(g) + vec2(float(di), float(dj));
                vec2 h = hash22(cell + fk * 17.0);
                if (h.x < 0.35) continue;
                vec2 c = (cell + 0.2 + 0.6 * h) * cellS - vec2(drift * (1.6 - 0.5 * fk), 0.15 * drift * sin(fk));
                vec2 d = p - c;
                // the cat's eye: the opening cut by the exit pupil, shifted outward with the distance from the middle
                vec2 shift = c * 0.35 * R / 0.3;
                float d1 = length(d) / R, d2 = length(d + shift) / R;
                float disc = (1.0 - smoothstep(0.92, 1.0, d1)) * (1.0 - smoothstep(0.92, 1.05, d2));
                float rim = exp(-pow((d1 - 0.92) / 0.05, 2.0)) * 0.6;
                float lit = (0.25 + 0.9 * band) * (0.5 + 0.5 * h.y);
                vec3 tint = famLight(fh, 0.2 + 0.6 * fract(h.y * 3.7), 0.3 + 0.15 * fk);
                col += tint * (disc * (0.22 + rim) * lit) * (k == 2 ? 1.6 : 1.0);
            }
    }
    finish(famExpose(col, 2.05, 0.80, 0.00, fh));
}
