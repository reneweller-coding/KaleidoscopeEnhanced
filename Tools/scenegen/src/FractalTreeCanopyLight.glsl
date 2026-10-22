//@doc
 * @brief FRACTAL TREE CANOPY LIGHT: a fractal tree whose branches glow, mirrored into an endless canopy with no
 * trunk -- rows of crowns growing up and hanging down so that their twigs interlace -- a ceiling of light seen
 * from below.  A tree is folded: a branch, then the space mirrored and turned to the branch's tip and shrunk, again
 * and again; the first levels (the trunk) stay dark.  One colour family from the photo, the young twigs paler.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the branching angle glides with the chord changes: the crowns open and close
 *   audioSwell       -> the crowns sway (a bounded bend through every level)
 *   audioAdvance     -> the canopy drifts (integrated)
 *
 * Knobs: angleP (the base branching angle), twigP (how many levels of twigs), hueP.
//@params angleP twigP
//@audio audioHarmAdvance audioSwell
//@body
/**  The distance to a segment.
 *
 * @param p  The point. (in)
 * @param a  One end. (in)
 * @param b  The other end. (in)
 *
 * @return
 *   The distance.
 **/
float segT(vec2 p, vec2 a, vec2 b)
{
    vec2 ab = b - a;
    return length(p - a - ab * clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0));
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float ang = 0.42 + 0.25 * clamp(angleP, 0.0, 1.0) + 0.1 * sin(0.8 * h) + 0.05 * sin(0.33 * h + 1.0);
    float sway = 0.06 * sin(0.4 * sceneTime) * (0.4 + 0.8 * clamp(audioSwell, 0.0, 1.0));
    float levels = 9.0 + 3.0 * clamp(twigP, 0.0, 1.0);
    float drift = 0.02 * sceneTime + 0.1 * audioAdvance;
    // the canopy: a row of trees growing up from below the frame and a row hanging down from above it, mirrored
    // side by side every 3 units, the hanging row offset by half; their crowns interlace in the middle
    vec2 u = p * 3.4 + vec2(drift * 2.0, 0.25 * sin(0.3 * drift));
    float d = 1e9, lvl = 0.0;
    for (int row = 0; row < 2; ++row) {
        vec2 v = row == 0 ? u : vec2(u.x + 1.5, -u.y);
        vec2 q = vec2((1.0 - abs(fract(v.x / 6.0) * 2.0 - 1.0)) * 6.0 - 3.0, v.y + 2.9);
        q.x = abs(q.x) > 1.5 ? 3.0 * sign(q.x) - q.x : q.x;     // the neighbouring tree, mirrored
        float s = 1.0;
        for (int i = 0; i < 12; ++i) {
            if (float(i) >= levels) break;
            float di = segT(q, vec2(0.0), vec2(0.0, 1.0)) / s;
            if (i >= 2 && di < d) { d = di; lvl = float(i); }   // the trunk (the first two) stays dark
            q.y -= 1.0;
            q.x = abs(q.x);
            q = rot2(-(ang + sway)) * q;                            // tilt the branch outward (rot2 turns by -a)
            q /= 0.72;
            s /= 0.72;
        }
    }
    float px = 3.4 / resolution.y;
    float g = exp(-pow(d / (px * 1.6), 2.0)) + 0.2 * exp(-d / (px * 10.0));
    vec3 col = famLight(fh, lvl / 11.0, 0.15 + 0.4 * (lvl / 11.0)) * g * (0.7 + 0.08 * lvl);
    col += famCol(fh, 0.5) * 0.012;
    finish(col);
}
