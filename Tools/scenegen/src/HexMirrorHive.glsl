//@doc
 * @brief HEX MIRROR HIVE: a kaleidoscope with a hexagonal tube of six mirrors: the content at the far end repeats as
 * a honeycomb of images, each hexagon a reflection of its neighbour, and the content's middle wanders so the whole
 * hive seems to breathe and slide.  Optics: six mirrors round a regular hexagon do not form a closed mirror group
 * (their corners are 120 degrees), so a real hexagonal tube shows images that disagree where reflections from two
 * sides meet; here each image cell is reached by reflecting across the cell walls on the straight way back to the
 * centre, which gives those seams where the ways disagree, and every bounce costs a tenth of the light.  The
 * content is the photo, in one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the content's middle wanders (integrated)
 *   audioSwell   -> the tube's width breathes slightly: the hive's cells swell
 *
 * Knobs: cellP (the hexagons' size), contentP (how much of the photo one cell shows), hueP.
//@params cellP contentP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float S = (0.14 + 0.12 * clamp(cellP, 0.0, 1.0)) * (1.0 + 0.04 * clamp(audioSwell, 0.0, 1.0));
    float cs = 0.6 + 0.8 * clamp(contentP, 0.0, 1.0);
    float ph = 0.03 * sceneTime + 0.15 * audioAdvance;
    vec2 mid = 0.25 * vec2(sin(ph), cos(0.8 * ph));
    // the hexagonal cell (neighbours at distance 1 in the directions 30 + k 60 degrees), its centre and the point in it
    vec2 r = vec2(1.7320508, 1.0);
    vec2 g = p / S;
    vec2 a = mod(g, r) - 0.5 * r, b = mod(g - 0.5 * r, r) - 0.5 * r;
    vec2 q = dot(a, a) < dot(b, b) ? a : b;
    vec2 cell = g - q;
    // walk back to the centre cell, reflecting across each wall crossed (along the straight line to the centre)
    vec2 x = q;
    float bounces = 0.0;
    vec2 c = cell;
    for (int i = 0; i < 24; ++i) {
        if (dot(c, c) < 0.25) break;
        float ang = atan(-c.y, -c.x) - 0.5235988;
        float k = floor(ang / 1.0471976 + 0.5);
        vec2 nrm = vec2(cos(k * 1.0471976 + 0.5235988), sin(k * 1.0471976 + 0.5235988));
        // reflect across the shared wall (half a step toward the centre) and step into the next cell
        x = x - 2.0 * (dot(x, nrm) - 0.5) * nrm - nrm;
        c += nrm;
        bounces += 1.0;
    }
    vec2 uv = rot2(0.2 * ph) * (x * S / (cs * 0.3) + mid) + 0.5;
    vec3 photo = imgLod(uv, 0.8 + 0.3 * bounces);
    vec3 col = famCol(fh, 0.15 + 0.7 * luma(photo)) * (0.25 + 1.2 * luma(photo));
    col *= pow(0.9, bounces);
    // the mirrors' meeting lines: the hexagons' edges
    float he = 0.5 - max(abs(q.y), abs(q.x) * 0.8660254 + abs(q.y) * 0.5);
    col *= smoothstep(0.0, 0.025, he);
    finish(col);
}
