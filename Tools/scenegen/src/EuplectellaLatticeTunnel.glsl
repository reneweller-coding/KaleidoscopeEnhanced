//@doc
 * @brief EUPLECTELLA LATTICE TUNNEL: a ride through the glass skeleton of a Venus' flower basket sponge: a tube woven of
 * glowing silica, a square lattice braced by diagonals in every other cell, with a second, wider lattice behind it seen
 * through the gaps; the lattice twists as the chords change.  The wall is the tube seen from inside (depth = focal
 * length / radius on screen); the lattice lines are the whole numbers of the wall's angle and depth coordinates,
 * sheared by the twist, and they are drawn at least a pixel and a half wide, so the far end of the tube does not
 * flicker.  The glass glows in shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the lattice twists with the chords (gliding)
 *   audioAdvance     -> the ride along the tube (integrated)
 *   audioSwell       -> the glass' glow
 *
 * Knobs: gridP (how fine the lattice is), layerP (how bright the outer lattice is), hueP.
//@params gridP layerP
//@audio audioHarmAdvance audioSwell
//@body
/**  The sponge's lattice on one tube wall.
 *
 * @param p      The place on screen. (in)
 * @param F      The wall's depth scale (depth = F / radius on screen). (in)
 * @param fly    The ride's position. (in)
 * @param n      The number of cells round the tube. (in)
 * @param twist  The lattice's shear. (in)
 *
 * @return
 *   x the glow of the lattice, y the depth.
 **/
vec2 lattice(vec2 p, float F, float fly, float n, float twist)
{
    float r = max(length(p), 0.02), a = atan(p.y, p.x);
    float dz = F / r;
    vec2 w = vec2(a, dz + fly) * n / 6.2831853;
    w.x += twist * w.y;
    // a lattice unit on screen, round the tube and along it: the lines never get thinner than a pixel and a half
    float ux = r * 6.2831853 / n, uy = 6.2831853 / n * r * r / F;
    float wx = max(0.035, 1.5 / (resolution.y * ux)), wy = max(0.035, 1.5 / (resolution.y * uy));
    float dx = abs(w.x - floor(w.x + 0.5)), dy = abs(w.y - floor(w.y + 0.5));
    float diag = 2.0 * min(abs(fract(0.5 * (w.x + w.y)) - 0.5), abs(fract(0.5 * (w.x - w.y)) - 0.5));
    float checker = step(0.5, fract(0.5 * (floor(w.x) + floor(w.y))));   // the braces sit in every other cell
    float g = exp(-pow(dx / wx, 2.0)) * 0.035 / wx + exp(-pow(dy / wy, 2.0)) * 0.035 / wy;
    g += 0.7 * checker * exp(-pow(diag / max(wx, wy), 2.0)) * 0.035 / max(wx, wy);
    float fade = exp(-0.18 * dz) * smoothstep(0.0, 0.3, dz);
    return vec2(g * fade, dz);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float fly = 0.25 * sceneTime + 1.0 * audioAdvance;
    float h = max(audioHarmAdvance, 0.0);
    float twist = 0.35 * sin(0.6 * h);
    float n = floor(12.0 + 8.0 * clamp(gridP, 0.0, 1.0));
    float glow = 0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec2 inner = lattice(p, 0.4, fly, n, twist);
    vec2 outer = lattice(p, 0.55, fly, n, -0.6 * twist);
    float back = 0.25 + 0.35 * clamp(layerP, 0.0, 1.0);
    vec3 col = famCol(fh, 0.45) * 0.012;
    col += famLight(fh, 0.35, 0.3) * outer.x * back;
    col += famLight(fh, 0.6, 0.6) * inner.x * glow;
    finish(col);
}
