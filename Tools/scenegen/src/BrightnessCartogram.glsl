//@doc
 * @brief BRIGHTNESS CARTOGRAM: a cartogram: the bright regions of the photo swell, the dark ones shrink, as on a map drawn by population: the photo is read at a place moved up the slope of its own softened brightness, so that the
 * bright places take more room and the dark less.  The inflation follows a threshold that wanders, so that now the very bright, now the middle tones are the ones that swell.  The strength follows the swell of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the strength of the inflation
 *   audioAdvance    -> the threshold wanders (integrated)
 *
 * Knobs: softP (how soft the map is), hueP.
//@params softP
//@audio audioSwell
//@body
/**  The weight of a place: the brightness of the photo softened, passed through the wandering threshold.
 *
 * @param p    The place. (in)
 * @param lod  The softening. (in)
 * @param thr  The threshold. (in)
 *
 * @return
 *   The weight, 0..1.
 **/
float cartW(vec2 p, float lod, float thr)
{
    return smoothstep(thr - 0.3, thr + 0.3, luma(imgLod(p * 0.8 + 0.5, lod)));
}
void main()
{
    vec2 p = screenP();
    float lod = 4.0 + 1.5 * clamp(softP, 0.0, 1.0);
    float thr = 0.5 + 0.3 * sin(0.05 * audioAdvance + 0.03 * sceneTime);
    float e = 0.03;
    vec2 g = vec2(cartW(p + vec2(e, 0.0), lod, thr) - cartW(p - vec2(e, 0.0), lod, thr),
                  cartW(p + vec2(0.0, e), lod, thr) - cartW(p - vec2(0.0, e), lod, thr)) / (2.0 * e);
    float k = 0.006 + 0.016 * clamp(audioSwell, 0.0, 1.0);
    finish(imgLod((p + k * g) * 0.8 + 0.5, 0.7) * 1.08);
}
