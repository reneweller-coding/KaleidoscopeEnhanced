//@doc
 * @brief FOUR MIRROR CORRIDOR: a square tube lined with four mirrors, looked into from one end: the object at the far
 * end appears again and again in an endless grid of images, every image of an image one more bounce away --
 * darker and softer -- and the whole grid turns with the tube.  Optics: the ray leaves the eye, travels the tube's
 * length and lands on the end plane at the point it would reach without the walls; each wall crossed is one
 * reflection, so the landing point is folded back into the tube's square and the crossings counted.  All images
 * lie in the end plane, as in a real tube.  The object is a piece of the photo in one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the tube turns (integrated)
 *   audioSwell   -> the tube seems longer: the far images fade more slowly (more of them glow)
 *   audioOnset   -> the object's light pulses (light)
 *
 * Knobs: widthP (the tube's width against its length), objectP (the object's size), hueP.
//@params widthP objectP
//@audio audioSwell audioOnset
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float W = 0.32 + 0.18 * clamp(widthP, 0.0, 1.0);           // the tube's width over its length (from the eye)
    float turn = 0.03 * sceneTime + 0.15 * audioAdvance;
    float keep = 0.82 + 0.1 * clamp(audioSwell, 0.0, 1.0);     // the light kept per bounce
    float sz = 0.5 + 0.4 * clamp(objectP, 0.0, 1.0);
    // the landing point on the end plane, in tube widths: the eye at the tube's axis
    vec2 q = rot2(turn) * p * 2.2 / W;
    vec2 cellId = floor(q + 0.5);
    vec2 f = q - cellId;                                         // -0.5 .. 0.5 in the cell
    // odd cells see the object mirrored
    vec2 m = mod(cellId, 2.0);
    vec2 g = mix(f, -f, m);
    float bounces = abs(cellId.x) + abs(cellId.y);
    // the image: a piece of the photo, soft for many bounces
    vec2 uv = g / sz + 0.5;
    vec3 photo = imgLod(uv, 1.0 + 0.4 * bounces);
    float body = smoothstep(0.62, 0.45, max(abs(g.x), abs(g.y)) / sz);
    vec3 obj = famCol(fh, 0.2 + 0.6 * luma(photo)) * (0.35 + 1.2 * luma(photo)) * body;
    obj += famLight(fh, 0.5, 0.6) * exp(-dot(g, g) * 30.0) * (0.15 + 0.5 * clamp(audioOnset, 0.0, 1.0));
    // the tube's own walls between the images: dark glass with a thin bright edge where two mirrors meet
    float seam = min(0.5 - abs(f.x), 0.5 - abs(f.y));
    vec3 col = obj + famCol(fh, 0.4) * 0.05;
    col *= pow(keep, bounces);
    col *= smoothstep(0.0, 0.012, seam);
    col += famLight(fh, 0.6, 0.4) * exp(-seam / 0.004) * 0.08 * pow(keep, bounces);
    finish(col);
}
