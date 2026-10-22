//@doc
 * @brief COLOUR SOLID FLIGHT: a flight through a piece of colour space cut round the photo's colours: space is divided
 * into cells, each holding one colour taken from the photo, a star of that colour at its heart, and where two cells
 * meet their colours glow as a veil of mist between them -- only neighbouring tones, drifting past as the view flies
 * on.  The cells are the Voronoi cells of a jittered lattice (the eight nearest sites are searched); the veil is the
 * place where the nearest and the second nearest site are almost equally near.  The path follows the harmony; each
 * section moves the piece of the photo the colours come from.  The colours are the photo's, calmed into one family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance       -> the flight (integrated)
 *   audioHarmAdvance   -> the flight path bends with the chords
 *   audioSectionId/Age -> every new section takes the colours from another part of the photo (cross-faded)
 *   audioSwell         -> the veils' glow
 *
 * Knobs: cellP (the cells' size), veilP (how wide the veils are), hueP.
//@params cellP veilP
//@audio audioHarmAdvance audioSectionId audioSectionPrev audioSectionAge audioSwell
//@body
/**  The photo's colour calmed toward the colour family.
 *
 * @param photo  The photo's colour. (in)
 * @param fh     The family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 tone(vec3 photo, float fh)
{
    float l = luma(photo);
    return mix(photo * 1.1, famCol(fh, 0.15 + 0.7 * l) * (0.25 + 1.2 * l), 0.45);
}

/**  A hash of a lattice cell: three numbers in 0..1.
 *
 * @param c  The cell. (in)
 *
 * @return
 *   The numbers.
 **/
vec3 hash3(vec3 c)
{
    return fract(sin(vec3(dot(c, vec3(127.1, 311.7, 74.7)), dot(c, vec3(269.5, 183.3, 246.1)), dot(c, vec3(113.5, 271.9, 124.6)))) * 43758.5453);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float S = 0.5 + 0.3 * clamp(cellP, 0.0, 1.0);
    float vw = 0.04 + 0.06 * clamp(veilP, 0.0, 1.0);
    float h = max(audioHarmAdvance, 0.0);
    float fly = 0.1 * sceneTime + 0.4 * audioAdvance;
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    vec2 offA = vec2(fract(max(audioSectionPrev, 0.0) * 0.37), fract(max(audioSectionPrev, 0.0) * 0.61));
    vec2 offB = vec2(fract(max(audioSectionId, 0.0) * 0.37), fract(max(audioSectionId, 0.0) * 0.61));
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 ro = vec3(0.4 * sin(0.15 * h + 0.1 * fly), 0.3 * cos(0.11 * h + 0.07 * fly), fly);
    vec3 rd = normalize(vec3(p, 1.3));
    rd.xz = rot2(0.2 * sin(0.13 * h)) * rd.xz;
    vec3 col = vec3(0.0);
    float t = 0.1;
    for (int i = 0; i < 48; ++i) {
        vec3 x = (ro + rd * t) / S;
        vec3 base = floor(x - 0.5);
        float d1 = 9.0, d2 = 9.0;
        vec3 c1 = vec3(0.0), c2 = vec3(0.0);
        for (int k = 0; k < 8; ++k) {
            vec3 cell = base + vec3(float(k & 1), float((k >> 1) & 1), float((k >> 2) & 1));
            vec3 site = cell + 0.25 + 0.5 * hash3(cell);
            float dd = dot(x - site, x - site);
            if (dd < d1) { d2 = d1; c2 = c1; d1 = dd; c1 = cell; }
            else if (dd < d2) { d2 = dd; c2 = cell; }
        }
        vec2 u1 = hash3(c1 + 7.0).xy, u2 = hash3(c2 + 7.0).xy;
        vec3 k1 = (1.0 - m) * tone(imgLod(fract(u1 * 0.5 + offA), 2.0), fh) + m * tone(imgLod(fract(u1 * 0.5 + offB), 2.0), fh);
        vec3 k2 = (1.0 - m) * tone(imgLod(fract(u2 * 0.5 + offA), 2.0), fh) + m * tone(imgLod(fract(u2 * 0.5 + offB), 2.0), fh);
        float gap = sqrt(d2) - sqrt(d1);
        float veil = exp(-pow(gap / vw, 2.0));
        float star = exp(-d1 / 0.0015);
        float fade = exp(-0.12 * t) * smoothstep(0.0, 0.4, t);
        col += (mix(k1, k2, 0.5) * veil * 0.09 * glow + k1 * star * 0.6) * fade;
        t += 0.09 + 0.02 * t;
    }
    col += famCol(fh, 0.45) * 0.02;
    finish(col);
}
