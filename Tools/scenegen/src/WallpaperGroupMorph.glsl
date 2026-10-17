//@doc
 * @brief WALLPAPER GROUP MORPH: the photo as a wallpaper -- a cut of it is the fundamental region, and a crystal group
 * of the plane repeats it: pmm's mirrors, p2's half-turns, p4's quarter-turns, p4m's square kaleidoscope, p3's
 * thirds, p6m's hexagonal kaleidoscope, cmm's centred mirrors, pg's glides.  The lattice itself deforms
 * continuously (it breathes, shears and turns), and on every change of harmony the pattern passes to a neighbouring
 * group, the two crossfading while the lattice keeps moving.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> each change of harmony moves to the next wallpaper group (crossfaded)
 *   audioPhase      -> the lattice turns (integrated)
 *   audioSwell      -> the lattice breathes (its cell size)
 *   audioKick       -> the mirror lines flash (light)
 *
 * Knobs: cellP (the base cell size), cutP (which cut of the photo fills the cell), lineP (how strongly the mirror
 * lines show), hueP.
//@params cellP cutP lineP
//@audio audioSwell audioKick audioHarmAdvance
//@body
/**  A point folded into the fundamental region of a wallpaper group (cell units), and how far it is from the
 * nearest mirror or rotation line (for drawing them).
 *
 * @param x  The point in cell units. (in)
 * @param g  The group: 0 pmm, 1 p2, 2 p4, 3 p4m, 4 p3, 5 p6m, 6 cmm, 7 pg. (in)
 *
 * @return
 *   The folded point (xy) and the distance to a symmetry line (z).
 **/
vec3 foldGroup(vec2 x, int g)
{
    if (g == 4 || g == 5) {
        // the hexagonal lattice: skewed cell coordinates, then fold into a triangle
        vec2 h = vec2(x.x - x.y * 0.57735, x.y * 1.1547);
        vec2 c = floor(h), f = fract(h);
        if (f.x + f.y > 1.0) { f = 1.0 - f; }                  // the triangle's second half, turned
        vec2 q = vec2(f.x + 0.5 * f.y, f.y * 0.8660254);       // back to Cartesian, inside one triangle
        if (g == 5) {
            // p6m: fold the triangle by its three mirrors into a sixth of it
            vec2 cen = vec2(0.5, 0.2886751);
            vec2 d = q - cen;
            float a = atan(d.y, d.x), r = length(d);
            float sec = 1.0471976;
            a = abs(mod(a, sec) - 0.5 * sec);
            q = cen + r * vec2(cos(a), sin(a));
            return vec3(q, min(abs(a) * r, abs(0.5 * sec - a) * r));
        }
        return vec3(q, min(min(q.y, abs(q.x * 0.866 - q.y * 0.5)), abs((1.0 - q.x) * 0.866 - q.y * 0.5)));
    }
    vec2 c = floor(x), f = fract(x);
    if (g == 0) {                                               // pmm: mirrors on both axes
        vec2 m = 1.0 - abs(f * 2.0 - 1.0);
        return vec3(m, min(min(m.x, m.y), min(1.0 - m.x, 1.0 - m.y)) * 0.5);
    }
    if (g == 1) {                                               // p2: half-turns about the cell corners
        if (mod(c.x + c.y, 2.0) > 0.5) f = 1.0 - f;
        return vec3(f, min(min(f.x, f.y), min(1.0 - f.x, 1.0 - f.y)));
    }
    if (g == 2 || g == 3) {                                     // p4 / p4m: quarter-turns, with mirrors for p4m
        int k = int(mod(c.x, 2.0)) + 2 * int(mod(c.y, 2.0));
        vec2 r = f - 0.5;
        r = k == 1 ? vec2(-r.y, r.x) : (k == 2 ? vec2(r.y, -r.x) : (k == 3 ? -r : r));
        if (g == 3) { r = abs(r); if (r.y > r.x) r = r.yx; }
        vec2 q = r + 0.5;
        return vec3(q, g == 3 ? min(abs(r.x - r.y), min(r.y, 0.5 - r.x)) : min(min(f.x, f.y), min(1.0 - f.x, 1.0 - f.y)));
    }
    if (g == 6) {                                               // cmm: a centred cell, mirrors and diagonal folds
        vec2 m = 1.0 - abs(f * 2.0 - 1.0);
        if (m.x + m.y > 1.0) m = 1.0 - m.yx;
        return vec3(m, min(min(m.x, m.y), abs(1.0 - m.x - m.y)));
    }
    // pg: a glide -- every other column flipped in y and shifted by half a cell
    if (mod(c.x, 2.0) > 0.5) f.y = fract(1.0 - f.y + 0.5);
    return vec3(f, min(f.x, 1.0 - f.x));
}

void main()
{
    vec2 p = screenP();
    float cell = (0.22 + 0.25 * clamp(cellP, 0.0, 1.0)) * (0.9 + 0.2 * clamp(audioSwell, 0.0, 1.0));
    // the lattice deforms continuously: it turns, breathes and shears
    mat2 def = rot2(0.03 * audioPhase + 0.01 * sceneTime) * mat2(1.0, 0.15 * sin(0.05 * sceneTime), 0.0, 1.0 + 0.1 * cos(0.04 * sceneTime));
    vec2 x = def * p / cell;
    float h = max(audioHarmAdvance, 0.0);
    int gA = int(mod(floor(h), 8.0)), gB = int(mod(floor(h) + 1.0, 8.0));
    float w = smoothstep(0.2, 0.8, fract(h));
    vec3 fa = foldGroup(x, gA), fb = foldGroup(x, gB);
    vec2 cut = vec2(0.15, 0.2) + 0.3 * vec2(clamp(cutP, 0.0, 1.0), hash11(clamp(cutP, 0.0, 1.0) * 7.0))
             + 0.08 * vec2(sin(0.031 * sceneTime), cos(0.023 * sceneTime));   // the motif drifts over the photo
    vec3 ca = imgLod(fa.xy * 0.6 + cut, 0.3), cb = imgLod(fb.xy * 0.6 + cut, 0.3);
    vec3 col = mix(ca, cb, w);
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = max(col + (col - vec3(lum)) * 0.4, 0.0) * (0.6 + 1.2 * smoothstep(0.05, 0.7, lum));   // more colour and contrast
    float line = mix(1.0 - smoothstep(0.0, 0.02, fa.z), 1.0 - smoothstep(0.0, 0.02, fb.z), w);
    vec3 tone = imgPalette(0.4 + 0.03 * audioPhase);
    col += mix(tone, vec3(1.0), 0.5) * line * (0.1 + 0.4 * clamp(lineP, 0.0, 1.0)) * (0.5 + clamp(audioKick, 0.0, 1.0));
    finish(col);
}
