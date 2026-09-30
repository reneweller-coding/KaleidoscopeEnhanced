//@doc
 * @brief WALLPAPER GROUP CYCLE: the photograph folded through the plane
 * symmetry groups -- a small cell of the texture is mirrored, rotated and
 * glide-reflected into an endless wallpaper, and the wallpaper wanders
 * slowly from one symmetry to the next (p4m, p6m, p3m1, p4g, pmm, cmm, p31m,
 * p6 ...), each change a soft cross-fade, while the window into the photo
 * drifts so the motif inside the cell keeps changing.  The mirror seams
 * glow faintly like the joints of a kaleidoscope.  Endless and mirrorable
 * by construction -- it IS a mirror pattern.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the cell turns (integrated, jump-free)
 *   audioAdvance    -> the window drifts through the photo (integrated)
 *   audioSwell      -> the cell size breathes (slow)
 *   audioRoughness  -> the mirrors warp like old glass
 *   audioHarmChange -> the seams flare on chord changes (light)
 *   audioMode       -> the seam colour warms in major
 *
 * Knobs: cellP (cell size), groupP (which groups the cycle favours),
 * speedP (how fast the groups change), hueP.
//@params cellP groupP speedP
//@audio audioPhase audioSwell audioRoughness audioHarmChange audioMode audioHigh
//@body
// Fold a point into the fundamental domain of a group; returns the folded
// point (0..1 cell coords) and writes the distance to the nearest mirror.
vec2 foldSquare(vec2 q, int g, out float seam)
{
    vec2 c = fract(q);
    vec2 id = floor(q);
    if (g == 0) {                       // pmm: mirrors on the cell edges
        c = abs(c - 0.5) * 2.0;
        seam = min(min(c.x, c.y), min(1.0 - c.x, 1.0 - c.y));
        return c;
    }
    if (g == 1) {                       // p4m: square with diagonals
        c = abs(c - 0.5) * 2.0;
        if (c.y > c.x) c = c.yx;
        seam = min(min(1.0 - c.x, c.y), abs(c.x - c.y) * 0.7071);
        return c;
    }
    if (g == 2) {                       // p4g: four-fold rotation plus mirrors off the centres
        vec2 d = c - 0.5;
        float par = mod(id.x + id.y, 2.0);
        if (par > 0.5) d = vec2(-d.y, d.x);
        d = abs(d);
        if (d.x + d.y > 0.5) d = vec2(0.5, 0.5) - d.yx;
        seam = min(abs(d.x + d.y - 0.5) * 0.7071, min(d.x, d.y));
        return d * 2.0;
    }
    // cmm: rhombic mirrors
    vec2 d = abs(c - 0.5);
    vec2 r = vec2(d.x + d.y, abs(d.x - d.y));
    seam = min(abs(r.x - 0.5), min(r.y, 0.5 - d.x)) * 0.7071;
    return r;
}

vec2 foldHex(vec2 q, int g, out float seam)
{
    // Hexagonal lattice: nearest hex centre, then fold by the 6 (or 3) mirrors.
    const vec2 s = vec2(1.0, 1.7320508);
    vec2 a = mod(q, s) - s * 0.5;
    vec2 b = mod(q - s * 0.5, s) - s * 0.5;
    vec2 h = dot(a, a) < dot(b, b) ? a : b;
    float ang = atan(h.y, h.x);
    float r = length(h);
    float n = (g == 4) ? 6.0 : 3.0;
    float sec = 3.14159265 / n;
    float fa = mod(ang, 2.0 * sec);
    if (g != 6) fa = abs(fa - sec);     // p6m / p3m1 mirror; p6 only rotates
    vec2 f = vec2(cos(fa), sin(fa)) * r;
    seam = (g != 6) ? min(abs(sin(fa)) * r, 0.5 * 0.866 - dot(h, normalize(vec2(cos(floor(ang / (3.14159265 / 3.0)) * 1.0472 + 0.5236), sin(floor(ang / (3.14159265 / 3.0)) * 1.0472 + 0.5236))))) : 0.5 * 0.866 - r * 0.9;
    return f * 1.6 + 0.2;
}

vec3 wallpaper(vec2 p, int g, float cell, vec2 win, float rot, out float seam)
{
    vec2 q = rot2(rot) * p / cell;
    vec2 f = (g < 4) ? foldSquare(q, g, seam) : foldHex(q, g, seam);
    seam *= cell;
    // The folded cell samples a window of the photo.
    vec2 uv = win + (f - 0.5) * 0.35;
    return imgLod(uv, 0.5);
}

void main()
{
    vec2 p = screenP();
    float swell = clamp(audioSwell, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float px = 1.0 / resolution.y;

    float cell = (0.18 + 0.22 * clamp(cellP, 0.0, 1.0)) * (0.9 + 0.2 * swell);
    p += 0.01 * rough * vec2(sin(p.y * 25.0 + sceneTime * 0.4), sin(p.x * 25.0 - sceneTime * 0.3));
    float rot = 0.03 * sceneTime + 0.25 * audioPhase;
    vec2 win = vec2(0.5) + 0.3 * vec2(sin(0.013 * sceneTime + audioAdvance * 0.2), cos(0.011 * sceneTime + audioAdvance * 0.17));

    // The cycle through the groups: a slow clock, cross-fading at each step.
    float clk = sceneTime * (0.02 + 0.05 * clamp(speedP, 0.0, 1.0)) + 7.0 * clamp(groupP, 0.0, 1.0);
    float k = floor(clk);
    float f = smoothstep(0.82, 1.0, fract(clk));
    int g0 = int(mod(k, 7.0)), g1 = int(mod(k + 1.0, 7.0));
    float s0, s1;
    vec3 c0 = wallpaper(p, g0, cell, win, rot, s0);
    vec3 c1 = (f > 0.0) ? wallpaper(p, g1, cell, win, rot, s1) : c0;
    if (f <= 0.0) s1 = s0;
    vec3 col = mix(c0, c1, f);
    float seam = mix(s0, s1, f);

    // Seams glow like the joints of a kaleidoscope.
    vec3 seamC = mix(vec3(0.6, 0.8, 1.0), vec3(1.0, 0.8, 0.5), clamp(audioMode, 0.0, 1.0));
    seamC = mix(seamC, imgPalette(0.2 + hueP * 0.159) * 1.4, 0.35);
    float glow = exp(-max(seam, 0.0) / (px * 2.5)) * (0.12 + 0.6 * clamp(audioHarmChange, 0.0, 1.0) + 0.15 * clamp(audioHigh, 0.0, 1.0));
    // Colour: the photo's own hue, or a wandering hue field where it is grey.
    col *= mix(vec3(1.0), glowColour(imgLod(win, 5.0), p * 1.5, hueP * 0.159) * 1.5, 0.4);
    col = col * 1.15 + seamC * glow;
    // A gentle vignette of depth toward the edges keeps the eye inside.
    col *= 0.85 + 0.15 * smoothstep(1.2, 0.2, length(p));
    finish(col);
}
