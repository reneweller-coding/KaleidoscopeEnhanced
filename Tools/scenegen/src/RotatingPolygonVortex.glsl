//@doc
 * @brief ROTATING POLYGON VORTEX: in a rotating tank with a spinning floor the free surface's vortex takes the shape
 * of a polygon -- a triangle, a square, a pentagon, up to an octagon -- that turns steadily while the fluid inside
 * shears past its corners.  Here a lattice of such vortices fills the frame, neighbours turning the other way; each
 * polygon is filled with the photo, which is sheared ever more toward its rim, and the corners glint.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> each change of harmony adds a corner (three to eight and round again, gliding)
 *   audioAdvance    -> the polygons turn (integrated)
 *   audioSwell      -> the shear inside the polygons
 *   audioKick       -> the corners flash (light)
 *
 * Knobs: cellsP (vortices on a screen height), shearP (the base shear), cornerP (how sharp the corners are), hueP.
//@params cellsP shearP cornerP
//@audio audioSwell audioKick audioHarmAdvance
//@body
/**  The number of corners: one more with every change of harmony, three to eight and round again, gliding.
 *
 * @return
 *   The number of corners (fractional while it glides), 3..9.
 **/
float cornersNow()
{
    float h = max(audioHarmAdvance, 0.0);
    return 3.0 + mod(floor(h), 6.0) + smoothstep(0.2, 0.8, fract(h));
}

void main()
{
    vec2 p = screenP();
    float cells = 2.0 + 2.0 * clamp(cellsP, 0.0, 1.0);
    vec2 g = p * cells;
    vec2 id = floor(g + 0.5);
    vec2 l = g - id;                                            // -0.5..0.5 in the cell
    float dir = mod(id.x + id.y, 2.0) < 0.5 ? 1.0 : -1.0;       // neighbours turn the other way
    float r = length(l), a = atan(l.y, l.x);
    float n = cornersNow();
    float n0 = floor(n), fn = fract(n);
    float nNext = n0 > 7.5 ? 3.0 : n0 + 1.0;                    // after the octagon, the triangle again
    float spin = dir * (0.15 * sceneTime + 0.03 * audioAdvance);
    // the polygon's radius at this angle: a rounded n-gon, gliding between two corner counts
    float sharp = 0.08 + 0.2 * clamp(cornerP, 0.0, 1.0);
    float rp0 = 0.36 * (1.0 + sharp * cos(n0 * (a - spin)));
    float rp1 = 0.36 * (1.0 + sharp * cos(nNext * (a - spin)));
    float rp = mix(rp0, rp1, fn);
    float inside = smoothstep(rp + 0.01, rp - 0.01, r);
    // the fluid inside turns with the polygon and shears toward the rim, back and forth (bounded: it never winds up)
    float sh = (0.5 + 1.5 * clamp(shearP, 0.0, 1.0)) * (0.6 + 0.8 * clamp(audioSwell, 0.0, 1.0));
    float twist = spin + dir * sh * 1.2 * sin(0.21 * sceneTime) * smoothstep(0.0, rp, r);
    vec2 q = r * vec2(cos(a - twist), sin(a - twist));
    vec2 uv = (id + q) / cells * 0.7 + 0.5;
    vec3 photo = imgLod(uv, 0.4);
    vec3 outer = imgLod((id + l) / cells * 0.7 + 0.5 + 0.05 * vec2(cos(spin), sin(spin)), 1.5) * 0.45;
    vec3 tone = imgPalette(0.2 + 0.1 * dir + 0.03 * audioPhase);
    vec3 col = mix(outer, photo * 1.1, inside);
    // the rim and its corners
    float rim = exp(-pow((r - rp) * 70.0, 2.0));
    float corner = pow(max(cos(n0 * (a - spin)), 0.0), 8.0);
    col += mix(tone, vec3(1.0), 0.5) * rim * (0.25 + 0.6 * corner * (0.4 + clamp(audioKick, 0.0, 1.0)));
    finish(col);
}
