//@doc
 * @brief TEXTURE STAR SAPPHIRE: a star sapphire cut as a dome fills the picture: the photo glows deep inside the stone,
 * a star of light rides on its surface where the light is reflected, and it wanders over the dome as the light moves
 * with the music's phase; the star brightens as the music swells, and every section brings another stone.  The dome is
 * a sphere's cap; its normal at each place decides where the light is mirrored, and the star's rays are three lines
 * crossing at that point at sixty degrees, as the silk needles in the stone cast them (six or twelve rays by the
 * section); the stone's body is the photo seen through the dome, tinted and calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase         -> the light moves, and the star wanders over the dome (integrated)
 *   audioSwell         -> the star brightens
 *   audioSectionId/Age -> every section brings another stone: its tint, its piece of the photo, its rays (cross-faded)
 *
 * Knobs: domeP (the dome's size), rayP (the rays' length), hueP.
//@params domeP rayP
//@audio audioPhase audioSwell audioSectionId audioSectionPrev audioSectionAge
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

/**  The stone at a place, for one section.
 *
 * @param q     The place on the dome (radius 1). (in)
 * @param sec   The section. (in)
 * @param star  The star's centre on the dome. (in)
 * @param rays  The rays' length. (in)
 * @param sw    The swell. (in)
 * @param fh    The family's hue. (in)
 *
 * @return
 *   The light.
 **/
vec3 stone(vec2 q, float sec, vec2 star, float rays, float sw, float fh)
{
    float r2 = dot(q, q);
    vec3 n = vec3(q, sqrt(max(1.0 - r2, 0.0)));
    vec2 off = vec2(0.23, 0.31) * mod(sec, 5.0);
    vec3 body = tone(imgLod(vec2(0.5) + q * 0.35 * (1.0 - 0.3 * n.z) + off, 2.0), fh);
    body = mix(body, famCol(fh, 0.35 + 0.1 * mod(sec, 3.0)) * (0.3 + 0.8 * luma(body)), 0.5) * (0.35 + 0.5 * n.z);
    float nr = mod(sec, 2.0) < 0.5 ? 3.0 : 6.0;                       // lines through the star: six or twelve rays
    vec2 d = q - star;
    float g = 0.0;
    for (int i = 0; i < 6; ++i) {
        float fi = float(i);
        if (fi >= nr) break;
        float an = 3.14159265 * fi / nr;
        vec2 dir = vec2(cos(an), sin(an));
        float across = abs(dot(d, vec2(-dir.y, dir.x)));
        float along = abs(dot(d, dir));
        g += exp(-pow(across / 0.012, 2.0)) * exp(-along / rays);
    }
    g += exp(-dot(d, d) / 0.004) * 1.5;
    float silk = 1.0;                                                 // the silk needles, three ways at sixty degrees
    for (int i = 0; i < 3; ++i) {
        float an = 2.0943951 * float(i);
        silk += 0.025 * sin(dot(q, vec2(cos(an), sin(an))) * 220.0 + 3.0 * fbm(q * 6.0 + float(i)));
    }
    return body * silk + famLight(fh, 0.5, 0.85) * g * (0.4 + 1.0 * sw);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float R = 0.62 + 0.28 * clamp(domeP, 0.0, 1.0);
    vec2 q = p / R;
    float la = 0.04 * sceneTime + 0.45 * audioPhase;
    vec2 star = 0.45 * vec2(cos(la), sin(0.7 * la));
    float rays = 0.25 + 0.35 * clamp(rayP, 0.0, 1.0);
    float sw = clamp(audioSwell, 0.0, 1.0);
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    float sA = max(audioSectionPrev, 0.0), sB = max(audioSectionId, 0.0);
    vec3 st = m * stone(q, sB, star, rays, sw, fh);
    if (m < 0.999) st += (1.0 - m) * stone(q, sA, star, rays, sw, fh);
    float r = length(q);
    float inside = 1.0 - smoothstep(1.0 - 2.0 / (R * resolution.y), 1.0 + 2.0 / (R * resolution.y), r);
    vec3 col = famCol(fh, 0.4) * 0.03 + famLight(fh, 0.5, 0.5) * 0.1 * exp(-max(r - 1.0, 0.0) * 6.0);
    col = mix(col, st, inside);
    finish(col);
}
