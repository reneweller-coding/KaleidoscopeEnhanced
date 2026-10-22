//@doc
 * @brief WATER JET ARCHWAY: glowing jets of water arch over the flight path, arch after arch, leaping from one side to
 * the other in time with the beat; the louder the music, the higher they leap, and where they land the water splashes
 * into a glowing pool.  Every arch is a parabola in a plane across the flight, the arches leaping alternately left and
 * right; the water along an arch is the jet's pulse of as many beats ago as it took to get there -- the jet opens for
 * most of every beat -- counted in a small field of the scene's own, which also smooths the swell for the jets' height.
 * The water glitters with droplets.  Shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBeatPhase -> the jets pulse with the beats: the water runs along the arches beat by beat (counted)
 *   audioSwell     -> how high the jets leap (smoothed)
 *   audioAdvance   -> the flight under the arches (integrated)
 *
 * Knobs: gapP (the arches' spacing), widthP (the jets' width), hueP.
//@params gapP widthP
//@audio audioBeatPhase audioSwell
//@state 1 1 60 32
//@body
/**  The state pass: the beats counted by summing the beat phase's steps, and the swell smoothed.
 *
 * @return
 *   x the beats so far, y the last beat phase, z the smoothed swell, 1.
 **/
vec4 stateStep()
{
    float bp = clamp(audioBeatPhase, 0.0, 1.0), sw = clamp(audioSwell, 0.0, 1.0);
    if (stateFrame < 0.5) return vec4(0.0, bp, sw, 1.0);
    vec4 old = texelFetch(texState, ivec2(0, 0), 0);
    float d = fract(bp - old.y + 1.0);
    if (d > 0.5) d = 0.0;
    return vec4(mod(old.x + d, 4096.0), bp, mix(old.z, sw, 0.02), 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    const float F = 1.1, W = 0.95, Y0 = -0.45;
    float D = 0.9 + 0.6 * clamp(gapP, 0.0, 1.0);
    float jw = 0.012 + 0.012 * clamp(widthP, 0.0, 1.0);
    float fly = 0.25 * sceneTime + 0.9 * audioAdvance;
    vec4 st = texelFetch(texState, ivec2(0, 0), 0);
    float dl = fract(clamp(audioBeatPhase, 0.0, 1.0) - st.y + 1.0);
    float beats = st.x + (dl < 0.5 ? dl : 0.0);                       // the count carried on to this frame
    float H = 0.55 + 0.45 * st.z;                                     // how high the jets leap
    vec3 water = famLight(fh, 0.4, 0.5), spray = famLight(fh, 0.6, 0.8);
    vec3 col = famCol(fh, 0.45) * 0.02;
    float k0 = floor(fly / D) + 1.0;
    for (int i = 0; i < 12; ++i) {
        float k = k0 + float(i);
        float dz = k * D - fly;
        vec2 w = p * dz / F;
        float px = dz / F / resolution.y;
        float fade = exp(-0.09 * dz) * smoothstep(0.0, 0.5, dz);
        float dir = mod(k, 2.0) < 0.5 ? 1.0 : -1.0;
        float x = clamp(w.x * dir, -W, W);
        float yA = Y0 + H * (1.0 - x * x / (W * W));
        float slope = -2.0 * H * x / (W * W);
        float dist = abs(w.y - yA) / sqrt(1.0 + slope * slope) + max(abs(w.x) - W, 0.0);
        float u = (x / W + 1.0) * 0.5;                                // 0 at the nozzle, 1 where it lands
        float ph = fract(beats - 0.8 * u + 0.37 * k);
        float on = smoothstep(0.0, 0.06, ph) * (1.0 - smoothstep(0.6, 0.7, ph));
        float sparkle = 0.6 + 0.4 * noise2(vec2(u * 60.0 - 8.0 * beats, k));
        float wpx = max(jw, 1.2 * px);
        col += water * exp(-pow(dist / wpx, 2.0)) * on * sparkle * fade * 1.2;
        col += water * exp(-dist / (4.0 * wpx)) * on * fade * 0.12;
        // the splash where it lands: the water that arrives now
        float land = fract(beats - 0.8 + 0.37 * k);
        float landOn = smoothstep(0.0, 0.06, land) * (1.0 - smoothstep(0.6, 0.7, land));
        vec2 lp = vec2(w.x - dir * W, (w.y - Y0) * 2.5);
        col += spray * exp(-dot(lp, lp) / 0.004) * landOn * fade * 0.8;
    }
    // the floor: a dark pool mirroring the glow
    if (p.y < Y0 / 3.0) col += famCol(fh, 0.4) * 0.04 * (0.7 + 0.3 * noise2(vec2(p.x * 8.0, 2.0 / (Y0 / 3.0 - p.y + 0.05) + fly)));
    finish(col);
}
