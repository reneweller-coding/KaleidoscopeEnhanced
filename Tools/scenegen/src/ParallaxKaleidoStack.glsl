//@doc
 * @brief PARALLAX KALEIDO STACK: five kaleidoscope planes behind each other, half transparent, each with its own
 * symmetry and its own sense of turning, each cut from another part of the photo; the eye glides forward and the
 * planes slide against each other in parallax -- the near ones fast, the far ones slow -- so the rosettes pass over
 * each other in depth.  A plane is see-through where its picture is dark, so the planes behind shine between the
 * bright parts.  The photo's own colours, calmed toward one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpectrum[32] -> each plane listens to its own band: that band's level brightens it
 *   audioAdvance      -> the glide (integrated): the parallax runs, the planes turn
 *   audioSwell        -> the planes' veils thicken
 *
 * Knobs: depthP (how far apart the planes stand), sidesP (the planes' base symmetry), hueP.  Distinct from
 * TextureEffectParallaxKaleidoscope, which has one fold.
//@params depthP sidesP
//@audio audioSpectrum[32] audioSwell
//@body
/**  The dihedral fold: a direction folded into one mirror sector of the given count.
 *
 * @param d      The point (centre at 0). (in)
 * @param sides  The number of mirrors. (in)
 *
 * @return
 *   The folded point.
 **/
vec2 kfold(vec2 d, float sides)
{
    float sec = 6.2831853 / sides;
    float a = abs(mod(atan(d.y, d.x), sec) - 0.5 * sec);
    return length(d) * vec2(cos(a), sin(a));
}

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
    float gap = 0.6 + 0.8 * clamp(depthP, 0.0, 1.0);
    float glide = 0.04 * sceneTime + 0.2 * audioAdvance;
    float veil = 0.6 + 0.4 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = famCol(fh, 0.5) * 0.03;
    // back to front: the far plane first
    for (int i = 4; i >= 0; --i) {
        float fi = float(i);
        float z = 1.0 + gap * fi;                                // the plane's distance
        vec2 cam = vec2(0.6 * sin(0.7 * glide), 0.4 * cos(0.5 * glide)) * 1.4;
        vec2 q = p * (0.8 + 0.3 * fi) + cam / z;                 // parallax: the near planes slide most
        float sides = floor(4.0 + 2.0 * clamp(sidesP, 0.0, 1.0)) + fi;
        float rot = glide * (0.6 + 0.25 * fi) * (mod(fi, 2.0) > 0.5 ? -1.0 : 1.0);
        vec2 c = 0.35 * vec2(sin(fi * 2.4), cos(fi * 1.7));       // each plane centred a little elsewhere
        vec2 k = kfold(rot2(rot) * (q - c), sides);
        vec2 uv = k * 0.55 + vec2(0.2 + 0.15 * fi, 0.3 + 0.1 * fi);
        vec3 photo = imgLod(uv, 0.3 + 0.35 * fi);
        float band = audioSpectrum[4 + 5 * i];
        float l = luma(photo);
        float alpha = smoothstep(0.3, 0.5, l) * veil * (0.7 + 0.25 * (1.0 - fi / 4.0));
        vec3 c3 = tone(photo, fh) * (0.6 + 0.9 * clamp(band, 0.0, 1.0)) * (1.0 - 0.12 * fi);
        col = mix(col, c3, alpha);
    }
    finish(col);
}
