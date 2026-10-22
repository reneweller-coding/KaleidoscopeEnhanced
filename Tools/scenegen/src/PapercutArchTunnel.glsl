//@doc
 * @brief PAPERCUT ARCH TUNNEL: a flight through layer upon layer of papercut arches, lit from behind: every sheet is
 * cut into an arch with a border of little leaves and rounds, the light shining through the cuts and through the
 * paper itself, each layer a different colour; the style of the cut changes with the sections of the music.  The sheets
 * stand across the flight a fixed step apart and are drawn from the nearest: a place inside a sheet's arch looks on to
 * the next; on the paper, the cut-outs of the border glow with the light behind.  A section's cut -- round, pointed or
 * keel arch, and its border's motif -- is cross-faded as light over six seconds.  The layers take shades of one colour
 * family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSectionId/Age -> every section cuts the arches in its own style (cross-faded over six seconds)
 *   audioAdvance       -> the flight through the layers (integrated)
 *   audioSwell         -> the light behind the paper
 *
 * Knobs: gapP (the layers' spacing), lacyP (how many cut-outs the border has), hueP.
//@params gapP lacyP
//@audio audioSectionId audioSectionPrev audioSectionAge audioSwell
//@body
/**  How far a place lies inside a sheet's arch, by the section's style.
 *
 * @param w      The place on the sheet. (in)
 * @param style  The style (0 round, 1 pointed, 2 keel). (in)
 *
 * @return
 *   The distance inside (positive) or outside (negative).
 **/
float archIn(vec2 w, float style)
{
    const float W = 0.55, Y0 = 0.05;
    float ax = abs(w.x), y = w.y - Y0;
    float side = W - ax;
    float top;
    if (style < 0.5) top = W - length(vec2(ax, max(y, 0.0)));
    else if (style < 1.5) top = 0.85 - length(vec2(ax + 0.3, max(y, 0.0) / 1.15));
    else top = 0.75 - length(vec2(ax + 0.2, max(y, 0.0) / 1.0)) - 0.12 * smoothstep(0.3, 0.6, y) * (1.0 - ax / W);
    return y < 0.0 ? side : min(side, top);
}

/**  A papercut sheet's light.
 *
 * @param w      The place on the sheet. (in)
 * @param style  The cut's style. (in)
 * @param k      The sheet's number. (in)
 * @param lacy   How many cut-outs the border has. (in)
 * @param px     A pixel on the sheet. (in)
 * @param back   The light behind the paper. (in)
 * @param fh     The family's hue. (in)
 *
 * @return
 *   rgb the light, a 1 where the sheet covers the place.
 **/
vec4 sheet(vec2 w, float style, float k, float lacy, float px, vec3 back, float fh)
{
    float din = archIn(w, style);
    if (din > 0.0) return vec4(back * exp(-pow(din / (3.0 * px + 0.004), 2.0)) * 0.8, 0.0);   // the cut's lit rim
    // the border: a band of cut-outs following the arch, leaves or rounds by the style
    float band = -din;
    float s = atan(w.x, w.y - 0.05);
    float n = 10.0 + 6.0 * lacy;
    float cs = fract(s / 3.14159265 * n) - 0.5;
    vec2 lq = vec2(cs * 0.09, band - 0.07);
    float hole = style < 0.5 ? 0.025 - length(lq) : 0.022 - length(lq * vec2(0.8, 1.6 - 0.8 * style));
    hole = max(hole, 0.012 - length(vec2(cs * 0.09, band - 0.14)));
    vec3 paper = famCol(fh, 0.25 + 0.5 * fract(k * 0.37)) * 0.35 * (0.5 + 0.5 * luma(back));
    vec3 col = paper + back * smoothstep(-px, px, hole) * 0.9;
    return vec4(col, 1.0);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    const float F = 1.1;
    float D = 0.7 + 0.5 * clamp(gapP, 0.0, 1.0);
    float fly = 0.25 * sceneTime + 0.9 * audioAdvance;
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    float sA = mod(max(audioSectionPrev, 0.0), 3.0), sB = mod(max(audioSectionId, 0.0), 3.0);
    float lacy = clamp(lacyP, 0.0, 1.0);
    vec3 back = mix(famLight(fh, 0.7, 0.5), imgLod(vec2(0.5) + 0.2 * p, 5.0), 0.3) * (0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    vec3 col = vec3(0.0);
    float cover = 0.0;
    float k0 = floor(fly / D) + 1.0;
    for (int i = 0; i < 10; ++i) {
        float k = k0 + float(i);
        float dz = k * D - fly;
        vec2 w = p * dz / F;
        float px = dz / F / resolution.y;
        float fade = exp(-0.1 * dz) * smoothstep(0.0, 0.3, dz);
        vec4 sh = (1.0 - m) * sheet(w, sA, k, lacy, px, back, fh) + m * sheet(w, sB, k, lacy, px, back, fh);
        col += (1.0 - cover) * sh.rgb * fade;
        cover += (1.0 - cover) * sh.a * smoothstep(0.0, 0.3, dz);
        if (cover > 0.995) break;
    }
    col += (1.0 - cover) * back * 0.7;                                 // the light at the far end
    finish(col);
}
