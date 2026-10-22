//@doc
 * @brief MEASURE RING TUNNEL: a tunnel built of the piece's bars: every bar is a ring of light, its four beats the
 * ring's four segments, and every eighth bar -- the phrase -- a tall pointed arch; the view flies one ring per bar, the
 * coming bar's ring lighting its segments beat by beat as they are played.  A small field of the scene's own counts the
 * bars by summing the bar phase's steps; ring n stands at depth n, the eye one bar before the current one, so the
 * current bar's ring reaches the eye as the bar ends.  The light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBarPhase  -> the bars: the flight (one ring per bar) and the segments lighting beat by beat
 *   audioSwell     -> the rings' glow
 *
 * Knobs: ringP (the rings' spacing), widthP (the segments' width), hueP.
//@params ringP widthP
//@audio audioBarPhase audioSwell
//@state 1 1 60 32
//@body
/**  The state pass: the bars counted by summing the bar phase's steps.
 *
 * @return
 *   x the bars so far, y the last bar phase, 0, 1.
 **/
vec4 stateStep()
{
    float bp = clamp(audioBarPhase, 0.0, 1.0);
    if (stateFrame < 0.5) return vec4(0.0, bp, 0.0, 1.0);
    vec4 old = texelFetch(texState, ivec2(0, 0), 0);
    float d = fract(bp - old.y + 1.0);
    if (d > 0.5) d = 0.0;                                             // (a small step back is not a whole bar)
    return vec4(mod(old.x + d, 4096.0), bp, 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    float D = 0.5 + 0.4 * clamp(ringP, 0.0, 1.0);
    float wr = 0.006 + 0.008 * clamp(widthP, 0.0, 1.0);
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float bc = texelFetch(texState, ivec2(0, 0), 0).r;
    float zc = (bc - 1.0) * D;
    float ang = atan(p.y, p.x), r = length(p);
    vec3 col = famCol(fh, 0.45) * 0.015;
    float n0 = floor(bc);
    for (int i = 0; i < 24; ++i) {
        float n = n0 + float(i);
        float dz = n * D - zc;
        if (dz < 0.12) continue;
        bool phraseRing = mod(n, 8.0) < 0.5;
        float R = (phraseRing ? 0.6 : 0.45) / dz;
        // the phrase's ring is a pointed arch: its radius grows toward the top
        float Ra = phraseRing ? R * (1.0 + 0.35 * smoothstep(0.0, 1.0, sin(ang))) : R;
        float d = abs(r - Ra);
        float seg = fract(ang / 1.5707963 + 0.5);                    // the four beats' segments
        float gap = smoothstep(0.02, 0.06, min(seg, 1.0 - seg));
        float beatIdx = floor(fract((ang + 1.5707963) / 6.2831853) * 4.0);
        float played = i == 0 ? smoothstep(beatIdx, beatIdx + 0.2, fract(bc) * 4.0) : 0.0;
        float lit = 0.25 + 1.4 * played + (phraseRing ? 0.6 : 0.0);
        float fade = exp(-0.1 * dz) * smoothstep(0.12, 0.5, dz);
        float w = wr / dz + 1.2 / resolution.y;
        col += famLight(fh, phraseRing ? 0.7 : 0.4, 0.3 + 0.5 * played) * exp(-pow(d / w, 2.0)) * gap * lit * fade * glow;
    }
    finish(famExpose(col, 5.85, 0.70, 0.03, fh));
}
