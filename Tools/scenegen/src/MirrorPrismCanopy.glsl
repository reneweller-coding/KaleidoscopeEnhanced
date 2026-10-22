//@doc
 * @brief MIRROR PRISM CANOPY: a canopy of hanging three-sided mirror prisms, row on row, each turning slowly on its
 * thread; every face shows a piece of a folded photo above, and together the faces build one kaleidoscope across
 * the whole frame that breaks and re-forms as the prisms turn.  Optics: a prism seen from below shows the face
 * turned most toward the eye; that face's normal turns the view ray, which then meets the folded photo higher up,
 * displaced by the face's angle.  Faces darken as they turn away (the cosine), their edges catch a thin line of
 * light.  One colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance     -> the prisms turn (integrated), each at its own pace
 *   audioHarmAdvance -> every chord change tilts whole groups of prisms (gliding)
 *   audioSwell       -> the faces' edges glow
 *
 * Knobs: prismP (the prisms' size), foldP (the photo's fold count), hueP.
//@params prismP foldP
//@audio audioHarmAdvance audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float W = 0.09 + 0.08 * clamp(prismP, 0.0, 1.0);           // the prisms' width
    float sides = floor(5.0 + 4.0 * clamp(foldP, 0.0, 1.0));
    float h = max(audioHarmAdvance, 0.0);
    float ph = 0.05 * sceneTime + 0.3 * audioAdvance;
    // the prisms hang in columns, rows offset by half; each is a vertical bar of width W, height 2.4 W
    vec2 g = p / vec2(W, 2.4 * W);
    float row = floor(g.y);
    g.x += 0.5 * mod(row, 2.0);
    vec2 cid = vec2(floor(g.x), row);
    vec2 f = fract(g) - 0.5;
    float hc = fract(sin(dot(cid, vec2(12.9898, 78.233))) * 43758.5453);
    // the prism's turn: its own pace, plus a group tilt that glides with the harmony
    float group = floor(cid.x / 4.0) + 3.0 * floor(cid.y / 3.0);
    float tilt = 0.5 * sin(0.8 * h + group * 1.7);
    float a = ph * (0.6 + 0.8 * hc) + 6.2831853 * hc + tilt;
    // across the bar, x in -0.5..0.5 is the visible width of the prism; split it into the faces seen
    float u = f.x;
    // the three faces at a + k * 120 degrees: the one whose projection covers u
    float best = -1.0, faceA = 0.0, faceU = 0.0;
    for (int k = 0; k < 3; ++k) {
        float fa = a + float(k) * 2.0943951;
        float w = cos(fa);                                       // how much the face turns toward the eye
        if (w <= 0.0) continue;
        float c = 0.5 * sin(fa) * 0.6;                           // the face's centre across the bar
        float d = abs(u - c) / max(0.5 * w * 0.9, 1e-3);
        float cover = 1.0 - d;
        if (cover > best) { best = cover; faceA = fa; faceU = (u - c) / max(w, 0.05); }
    }
    vec3 col = famCol(fh, 0.4) * 0.03;
    if (best > 0.0) {
        float w = cos(faceA);
        // the folded photo above, displaced by the face's angle
        vec2 sky = p + vec2(0.35 * sin(faceA), 0.1 * cos(faceA)) + vec2(faceU * W * 2.0, f.y * W);
        vec2 k = kaleidoUV(sky * 0.9 + 0.5, sides);
        vec3 photo = imgLod(k, 0.9);
        col = famCol(fh, 0.15 + 0.7 * luma(photo)) * (0.25 + 1.2 * luma(photo)) * (0.4 + 0.6 * w);
        col += famLight(fh, 0.6, 0.5) * exp(-best / 0.05) * (0.15 + 0.4 * clamp(audioSwell, 0.0, 1.0));
    }
    // the prism's top and bottom ends
    col *= smoothstep(0.5, 0.44, abs(f.y));
    finish(col);
}
