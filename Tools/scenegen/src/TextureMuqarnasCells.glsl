//@doc
 * @brief TEXTURE MUQARNAS CELLS: a muqarnas half-dome seen from the front -- tier above tier of pointed cells fanning
 * up and out, each cell holding its own piece of the photo -- and the cells open in waves as the music swells: a cell
 * deepens and its photo glows, then settles again.  The tiers are rings round a point below the picture, every tier
 * with more cells than the one beneath, offset by half a cell; a cell is a pointed niche in its sector, shaded as a
 * hollow, and its opening is a wave running over the tiers whose height is the swell.  The pieces are the photo, calmed
 * toward one colour family.  Distinct from MuqarnasCorridor, a vault to fly through.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the cells open in waves: the higher the swell, the deeper they open
 *   audioAdvance -> the waves run over the tiers (integrated)
 *
 * Knobs: tierP (how many tiers), rimP (how bright the rims are), hueP.
//@params tierP rimP
//@audio audioSwell
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

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    vec2 o = vec2(0.0, -0.62);
    vec2 d = p - o;
    float rho = length(d), ang = atan(d.x, d.y);                       // 0 straight up, +-pi/2 to the sides
    float TH = 0.13 + 0.05 * (1.0 - clamp(tierP, 0.0, 1.0));         // a tier's height
    float tier = floor(rho / TH);
    float v = rho / TH - tier;                                        // up the cell, 0..1
    float nc = 5.0 + 2.0 * tier;                                      // cells in this tier
    float sa = (ang / 3.14159265 + 0.5) * nc + 0.5 * mod(tier, 2.0);
    float ci = floor(sa);
    float u = fract(sa) - 0.5;                                        // across the cell
    float au = abs(u);
    float side = 0.45 - au;
    float arc = 0.75 - length(vec2(au + 0.3, (v - 0.55) / 0.6));
    float din = min(v < 0.55 ? side : min(side, arc), v);              // inside the pointed cell
    float run = 0.2 * sceneTime + 0.8 * audioAdvance;
    float wave = 0.5 + 0.5 * sin(0.9 * tier - 0.6 * ci / nc * 6.2831853 - run);
    float open = 0.25 + 0.75 * clamp(audioSwell, 0.0, 1.0) * wave;
    vec2 piece = vec2(0.5) + 0.32 * vec2(sin(ang), cos(ang)) * min(rho, 1.4) + vec2(u * 0.05, v * 0.04);
    vec3 ph = tone(imgLod(piece, 1.2), fh);
    float hollow = (0.3 + 0.7 * (1.0 - v)) * (0.4 + 0.6 * open);
    float px = 1.0 / (TH * resolution.y);
    vec3 col = ph * 0.08;                                             // the stone between the cells
    col = mix(col, ph * hollow * (0.6 + 0.8 * open), smoothstep(-px, px, din));
    float rim = exp(-pow(din / (1.5 * px + 0.012), 2.0));
    col += famLight(fh, 0.65, 0.5) * rim * (0.2 + 0.5 * clamp(rimP, 0.0, 1.0)) * (0.6 + 0.6 * open);
    finish(col);
}
