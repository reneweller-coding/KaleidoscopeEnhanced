//@doc
 * @brief FLOCK TUNNEL ESCORT: a flock of glowing points escorts the eye through a dark space: it streams alongside,
 * wheels round, splits into two flocks that pass either side and joins up again.  Each point keeps a place in a
 * flock -- a soft cloud round a centre that weaves ahead of the eye -- plus its own slow wobble; the flock's centre is
 * one of two weaving paths, and when the flock splits each point glides over to its half.  The points are drawn by
 * depth, near ones large and soft.  Their light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSectionId/Age -> every new section splits the flock or joins it again (the points glide over eight seconds)
 *   audioSwell         -> the flock's density (more points shine)
 *   audioAdvance       -> the flock weaves (integrated)
 *
 * Knobs: pointP (how many points), spreadP (how wide the flock is), hueP.
//@params pointP spreadP
//@audio audioSectionId audioSectionPrev audioSectionAge audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float N = floor(220.0 + 140.0 * clamp(pointP, 0.0, 1.0));
    float spread = 0.5 + 0.4 * clamp(spreadP, 0.0, 1.0);
    float weave = 0.06 * sceneTime + 0.25 * audioAdvance;
    float splitA = mod(max(audioSectionPrev, 0.0), 2.0), splitB = mod(max(audioSectionId, 0.0), 2.0);
    float split = mix(splitA, splitB, smoothstep(0.0, 8.0, audioSectionAge));
    float dens = 0.45 + 0.55 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = famCol(fh, 0.45) * 0.012;
    for (int i = 0; i < 360; ++i) {
        float fi = float(i);
        if (fi >= N) break;
        float h1 = fract(sin(fi * 12.9898) * 43758.5453), h2 = fract(sin(fi * 78.233) * 43758.5453);
        float h3 = fract(sin(fi * 37.719) * 43758.5453);
        float on = smoothstep(h3 - 0.05, h3 + 0.05, dens);
        if (on <= 0.0) continue;
        // the flock's centre: weaving ahead of the eye; split, each half takes one side
        float side = h1 < 0.5 ? -1.0 : 1.0;
        vec3 c = vec3(0.25 * sin(weave + 0.3 * side * split * 3.0), 0.1 * cos(0.7 * weave), 1.7);
        c.x += split * side * 0.5;
        // the point's own place in the cloud and its wobble
        vec3 o = (vec3(fract(2.0 * h1), h2, h3) - 0.5) * vec3(2.2, 1.4, 2.0) * spread;   // (x not from h1: that picks the side)
        o += 0.08 * vec3(sin(weave * 3.0 + 6.0 * h1), cos(weave * 2.7 + 6.0 * h2), sin(weave * 2.3 + 6.0 * h3));
        vec3 x = c + o;
        vec2 sp = x.xy / x.z * 1.3;
        float size = 0.004 + 0.02 / max(x.z, 0.5) * 0.4;
        float d = length(p - sp);
        float g = smoothstep(size, size * 0.6, d) + 0.25 * exp(-d / (size * 2.5));
        col += famLight(fh, fract(h2 + 0.3 * side), 0.4) * g * on * (1.4 / x.z);
    }
    finish(col);
}
