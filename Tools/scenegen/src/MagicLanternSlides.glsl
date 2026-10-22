//@doc
 * @brief MAGIC LANTERN SLIDES: a magic lantern's chromatrope -- two painted glass discs turning against each other in
 * front of the lamp -- projected on the wall: where the paintings on the two discs overlap, their light multiplies,
 * so patterns comb through each other, vanish and are born anew.  Each disc is painted with radial bands and petals
 * from the photo (read in polar coordinates, so the painting wraps round the disc); the projection is the lamp's
 * light passing both, with the soft fall-off of the lens at the edge.  One colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the discs turn against each other (integrated)
 *   audioSwell   -> the lamp brightens
 *   audioSectionId/Age -> every new section swaps the second disc's painting (over six seconds)
 *
 * Knobs: petalP (the petals' count), bandP (the bands' count), hueP.
//@params petalP bandP
//@audio audioSwell audioSectionId audioSectionPrev audioSectionAge
//@body
/**  A painted disc's transmission at a point (polar: radius r, angle a), its painting turned by the given angle.
 *
 * @param r       The radius. (in)
 * @param a       The angle. (in)
 * @param turn    The disc's turn. (in)
 * @param petals  The petals' count. (in)
 * @param bands   The bands' count. (in)
 * @param seed    The painting's own offset. (in)
 *
 * @return
 *   How much light passes (0..1).
 **/
float disc(float r, float a, float turn, float petals, float bands, float seed)
{
    float b = a - turn;
    // the painting: the photo read round the disc (mirrored at the half turn, so it closes up), then petals and bands
    vec2 uv = vec2(abs(fract(b / 6.2831853) * 2.0 - 1.0), r * 0.9 + seed);
    float photoL = luma(imgLod(uv * vec2(0.8, 0.8) + 0.1, 1.5));
    float petal = 0.5 + 0.5 * cos(petals * b + 6.0 * r + 3.0 * seed);
    float band = 0.5 + 0.5 * cos(bands * 6.2831853 * r - 2.0 * petal);
    return clamp(0.15 + 0.85 * pow(petal * band, 0.7) * (0.5 + photoL), 0.0, 1.0);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float petals = floor(5.0 + 7.0 * clamp(petalP, 0.0, 1.0));
    float bands = 3.0 + 4.0 * clamp(bandP, 0.0, 1.0);
    float turn = 0.05 * sceneTime + 0.3 * audioAdvance;
    float lamp = 0.8 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float seedA = 0.13 * mod(max(audioSectionPrev, 0.0), 5.0), seedB = 0.13 * mod(max(audioSectionId, 0.0), 5.0);
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    float r = length(p) * 1.4;
    float a = atan(p.y, p.x);
    float d1 = disc(r, a, turn, petals, bands, 0.0);
    float d2 = mix(disc(r, a, -1.3 * turn, petals + 2.0, bands * 0.8, seedA + 0.5),
                   disc(r, a, -1.3 * turn, petals + 2.0, bands * 0.8, seedB + 0.5), m);
    float light = d1 * d2;
    // the lens: soft fall-off toward the edge of the projected circle, a warm hot spot in the middle
    float lens = smoothstep(1.25, 0.6, r) * (0.8 + 0.4 * exp(-r * r * 2.0));
    vec3 col = famLight(fh, 0.2 + 0.6 * d1, 0.2 * light) * light * lens * lamp * 1.4;
    col += famCol(fh, 0.4) * 0.02;
    finish(col);
}
