//@doc
 * @brief MUQARNAS CORRIDOR: a corridor vaulted with muqarnas -- tier upon tier of pointed niches, each holding two
 * smaller niches, their rims glowing -- flown through endlessly while the order of the niches changes with the
 * harmony.  The vault is the tunnel's wall, cut into tiers along the flight and niches around, every tier offset by
 * half a niche; a niche is a pointed arch (two arcs meeting at the apex), shaded like a hollow lit from below, and its
 * lower half holds two half-size niches.  The number of niches round a tier steps with the harmony's advance and is
 * cross-faded as light.  The niches take the photo's colours, calmed toward one colour family.  Distinct from
 * MuqarnasDome, which is a dome.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the niches' order: a chord change brings more or fewer niches round a tier (cross-faded)
 *   audioAdvance     -> the flight (integrated)
 *   audioSwell       -> the rims' glow
 *
 * Knobs: tierP (the tiers' depth), rimP (how bright the rims are), hueP.
//@params tierP rimP
//@audio audioHarmAdvance audioSwell
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

/**  A pointed niche: how far a place lies inside it.
 *
 * @param u  Across the niche (-0.5..0.5). (in)
 * @param v  Up the niche (0 at its foot, 1 at its apex). (in)
 *
 * @return
 *   The distance inside (positive) or outside (negative), in niche widths.
 **/
float niche(float u, float v)
{
    float au = abs(u);
    float side = 0.45 - au;
    float arc = 0.75 - length(vec2(au + 0.3, (v - 0.6) / 0.58));      // two arcs meeting at the apex
    return min(v < 0.6 ? side : min(side, arc), v);
}

/**  The vault at a place, in niches.
 *
 * @param x    Around (in niches). (in)
 * @param y    Along (in tiers). (in)
 * @param M    The niches round a tier. (in)
 * @param px   A pixel in niches. (in)
 * @param fh   The family's hue. (in)
 *
 * @return
 *   rgb the vault's colour, a the rims' glow.
 **/
vec4 vault(float x, float y, float M, float px, float fh)
{
    float j = floor(y), v = fract(y);
    float xo = x - 0.5 * mod(j, 2.0);
    float i = floor(xo), u = fract(xo) - 0.5;
    float d1 = niche(u, v);
    // the two small niches in the lower half
    float u2 = fract(u * 2.0 + 0.5) - 0.5, v2 = v * 2.0;
    float d2 = v < 0.5 ? niche(u2, v2) * 0.5 : -1.0;
    vec3 fill = tone(imgLod(fract(vec2(mod(i, M) / M, j * 0.137)) * 0.8 + 0.1, 3.0), fh);
    float hollow = 0.3 + 0.7 * (1.0 - v) * (1.0 - v);                 // lit from below, dark in the apex
    float hollow2 = 0.35 + 0.65 * (1.0 - v2);
    vec3 col = fill * 0.12;
    col = mix(col, fill * hollow * 0.8, smoothstep(-px, px, d1));
    col = mix(col, fill * hollow2 * 0.9, smoothstep(-px, px, d2));
    float rim = exp(-pow(d1 / (1.4 * px + 0.006), 2.0)) + 0.7 * exp(-pow(d2 / (1.4 * px + 0.004), 2.0));
    return vec4(col, rim);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    const float R0 = 0.4;
    float r = max(length(p), 1e-3), a = atan(p.y, p.x);
    float z = R0 / r;
    float fly = 0.22 * sceneTime + 0.8 * audioAdvance;
    float T = 0.3 + 0.2 * clamp(tierP, 0.0, 1.0);                     // a tier's depth
    float h = max(audioHarmAdvance, 0.0), hk = floor(h), m = smoothstep(0.3, 0.7, fract(h));
    float MA = 10.0 + 2.0 * mod(hk, 3.0), MB = 10.0 + 2.0 * mod(hk + 1.0, 3.0);
    float py = R0 / (r * r * resolution.y) / T;
    vec4 vA = vault(a / 6.2831853 * MA, (z + fly) / T, MA, max(py, MA / (6.2831853 * r * resolution.y)), fh);
    vec4 vB = vault(a / 6.2831853 * MB, (z + fly) / T, MB, max(py, MB / (6.2831853 * r * resolution.y)), fh);
    vec4 v = mix(vA, vB, m);
    float detail = 1.0 - smoothstep(0.1, 0.3, py);
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = v.rgb * glow + famLight(fh, 0.65, 0.5) * v.a * (0.25 + 0.5 * clamp(rimP, 0.0, 1.0)) * detail * glow;
    col = mix(col, famCol(fh, 0.5) * 0.3, smoothstep(5.0, 18.0, z));
    col += famLight(fh, 0.6, 0.6) * exp(-r * 9.0) * 0.35;
    finish(col);
}
