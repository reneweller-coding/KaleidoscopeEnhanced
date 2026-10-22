//@doc
 * @brief TRIANGULAR PRISM KALEIDO: a kaleidoscope made of a solid triangular glass prism instead of mirrors -- the
 * light is folded by total internal reflection at the prism's faces -- so every image of an image carries a fine
 * seam of spectral colour at its edges, where the glass splits the light.  Optics: the view ray is folded back into
 * the triangle across the face it crossed, as in a mirror kaleidoscope, but each reflection also shifts the three
 * colour channels apart a little (dispersion), so the edges of deeper images grow thin coloured fringes.  The
 * fringes stay narrow and round the photo's colour family; the bulk of the picture is in that family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the prism turns (integrated)
 *   audioRolloff -> the dispersion (brighter music, wider fringes)
 *   audioSwell   -> the content glows
 *
 * Knobs: sizeP (the prism's size on screen), contentP (how much of the photo the prism holds), hueP.
//@params sizeP contentP
//@audio audioRolloff audioSwell
//@body
/**  Fold a point into the equilateral triangle (side 1, centre at 0) by reflecting it across the side it lies
 * beyond, again and again.
 *
 * @param p  The point. (in)
 * @param n  Returns how many reflections it took. (out)
 * @param e  Returns the distance to the nearest side. (out)
 *
 * @return
 *   The point inside the triangle.
 **/
vec2 triFold(vec2 p, out float n, out float e)
{
    const vec2 N0 = vec2(0.0, -1.0), N1 = vec2(0.8660254, 0.5), N2 = vec2(-0.8660254, 0.5);
    const float H = 0.2886751;
    n = 0.0;
    for (int i = 0; i < 48; ++i) {
        float d0 = dot(p, N0) - H, d1 = dot(p, N1) - H, d2 = dot(p, N2) - H;
        float dm = max(d0, max(d1, d2));
        if (dm <= 0.0) break;
        p -= 2.0 * dm * (dm == d0 ? N0 : dm == d1 ? N1 : N2);
        n += 1.0;
    }
    e = -max(dot(p, N0) - H, max(dot(p, N1) - H, dot(p, N2) - H));
    return p;
}

/**  The prism's content at a folded point: the photo, in the colour family.
 *
 * @param q   The point in the triangle. (in)
 * @param cs  The content's scale. (in)
 * @param fh  The colour family. (in)
 *
 * @return
 *   The light.
 **/
vec3 content(vec2 q, float cs, float fh)
{
    vec3 photo = imgLod(q * cs + 0.5, 0.8);
    float l = luma(photo);
    return famCol(fh, 0.15 + 0.7 * l) * (0.08 + 1.6 * l * l);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float S = 0.45 + 0.35 * clamp(sizeP, 0.0, 1.0);
    float cs = 0.8 + 0.8 * clamp(contentP, 0.0, 1.0);
    float turn = 0.03 * sceneTime + 0.15 * audioAdvance;
    float disp = 0.004 + 0.012 * clamp(audioRolloff, 0.0, 1.0);
    vec2 q0 = rot2(turn) * p / S;
    // each colour channel folded from a slightly shifted start: the shift grows with the distance (the bounces)
    vec2 sh = normalize(q0 + 1e-4) * disp * length(q0);
    float nR, eR, nG, eG, nB, eB;
    vec2 qR = triFold(q0 + sh, nR, eR), qG = triFold(q0, nG, eG), qB = triFold(q0 - sh, nB, eB);
    vec3 cR = content(qR, cs, fh), cG = content(qG, cs, fh), cB = content(qB, cs, fh);
    // the bulk keeps the family; only where the channels disagree (the image edges) a fine spectral seam shows
    vec3 col = cG * pow(0.94, nG) * smoothstep(0.0, 0.004, eG);
    float split = clamp(abs(nR - nB) + abs(luma(cR) - luma(cB)) * 2.0, 0.0, 1.0);
    vec3 fringe = vec3(luma(cR) * pow(0.94, nR), luma(cG) * pow(0.94, nG), luma(cB) * pow(0.94, nB));
    col = mix(col, famLight(fh, 0.5, 0.0) * 0.4 + fringe * 0.9, split * 0.6);
    col *= 0.9 + 0.4 * clamp(audioSwell, 0.0, 1.0);
    finish(col);
}
