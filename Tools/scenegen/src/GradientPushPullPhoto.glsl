//@doc
 * @brief GRADIENT PUSH PULL PHOTO: the pixels are pushed along the gradient of brightness, in or out: the photo swells out of its own edges or shrinks into them, and the direction changes steadily from one to the other, so that every
 * edge in turn blooms outward and draws in again, the shapes of the photo breathing on their own outlines.  The strength follows the swell of the music, the changing of direction its phase.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the strength of the push
 *   audioPhase      -> the direction changes between push and pull (integrated)
 *
 * Knobs: edgeP (how fine the edges are), hueP.
//@params edgeP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float lod = 1.2 + 2.0 * (1.0 - clamp(edgeP, 0.0, 1.0));
    float e = 0.004 * (1.0 + lod);
    vec2 g = vec2(luma(imgLod(uv + vec2(e, 0.0), lod)) - luma(imgLod(uv - vec2(e, 0.0), lod)),
                  luma(imgLod(uv + vec2(0.0, e), lod)) - luma(imgLod(uv - vec2(0.0, e), lod))) / (2.0 * e);
    float dirr = sin(0.15 * audioPhase + 0.05 * sceneTime);
    float k = (0.002 + 0.006 * clamp(audioSwell, 0.0, 1.0)) * dirr;
    finish(imgLod(uv + k * g, 0.7) * 1.08);
}
