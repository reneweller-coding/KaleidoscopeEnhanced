//@doc
 * @brief RECURSIVE CIRCLE INVERSION: a ring of circles, each touching its neighbours, and a point inverted in
 * whichever of them it falls into, again and again; where the orbits pile up -- the limit set of the inversions --
 * rings of light appear, nested in each other without end, chains of ever smaller pearls round every circle.  The
 * light is the closest the orbit came to any circle's rim, scaled back by the inversions' stretch, so every ring of
 * the set is equally fine.  One colour family from the photo, each depth of nesting a shade.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the circles' radii breathe: the chains open and close
 *   audioAdvance -> the ring of circles turns (integrated)
 *   audioOnset   -> one depth of nesting flares
 *
 * Knobs: countP (how many circles in the ring), ringP (the rings' width), hueP.
//@params countP ringP
//@audio audioSwell audioOnset
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float N = floor(4.0 + 4.0 * clamp(countP, 0.0, 1.0));
    float turn = 0.03 * sceneTime + 0.12 * audioAdvance;
    // N circles round the origin, neighbours touching: centre distance D, radius D sin(pi / N)
    float D = 1.0;
    float r = D * sin(3.14159265 / N) * (1.0 + 0.06 * clamp(audioSwell, 0.0, 1.0));
    float width = (1.2 + 1.5 * clamp(ringP, 0.0, 1.0)) / resolution.y;
    float flare = clamp(audioOnset, 0.0, 1.0);
    vec2 z = p * 1.7;
    float scale = 1.0, best = 1e9, depth = 0.0;
    for (int i = 0; i < 24; ++i) {
        // the nearest circle of the ring
        float a = atan(z.y, z.x) - turn;
        float k = floor(a * N / 6.2831853 + 0.5);
        float ca = k * 6.2831853 / N + turn;
        vec2 c = D * vec2(cos(ca), sin(ca));
        vec2 v = z - c;
        float l2 = dot(v, v);
        float rim = abs(sqrt(l2) - r) / scale;
        if (rim < best) { best = rim; depth = float(i); }
        if (l2 >= r * r) break;                                  // outside every circle: the orbit ends
        z = c + v * (r * r / l2);                                // the inversion in that circle
        scale *= r * r / l2;
    }
    float g = exp(-pow(best / (1.7 * width), 1.3));
    float halo = exp(-best / (1.7 * width * 14.0)) * 0.18;
    float fl = 1.0 + 2.0 * flare * step(0.5, fract(0.5 * depth));
    vec3 col = famLight(fh, fract(0.13 * depth + 0.1), 0.3 * g) * (g + halo) * fl;
    col += famCol(fh, 0.5) * 0.012;
    finish(col);
}
