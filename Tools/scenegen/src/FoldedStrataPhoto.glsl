//@doc
 * @brief FOLDED STRATA PHOTO: the rows of the photo as sedimentary layers, folded into saddles and troughs and tipped over into recumbent folds; the fold axes wander and the cross-section shows every layer in its own colour --
 * each layer is one row of the photo, laid along the fold, with thin dark joints between the layers and a fault that slides the layers apart by a smooth step.  The amplitude of the folds follows the swell, their wavelength the
 * spectral spread, and at a new section the fault glides to a new throw.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the folds' amplitude
 *   audioSpread     -> the folds' wavelength
 *   audioSectionId/Prev/Age -> the fault's throw glides to a new value at a section change
 *
 * Knobs: layerP (how many layers), hueP.
//@params layerP
//@audio audioSwell audioSpread audioSectionId audioSectionPrev audioSectionAge
//@body
void main()
{
    vec2 p = screenP();
    float t = 0.02 * sceneTime + 0.1 * audioAdvance;
    float k = 3.0 + 4.0 * (1.0 - clamp(audioSpread, 0.0, 1.0));
    float A = 0.07 + 0.13 * clamp(audioSwell, 0.0, 1.0);
    float x2 = p.x + 0.12 * sin(2.3 * p.y + 0.7 * t);
    float v = p.y + A * sin(k * x2 + t) + 0.5 * A * sin(1.7 * k * p.x - 0.8 * t + 2.0 * p.y);
    float blend = smoothstep(0.0, 6.0, audioSectionAge);
    float thA = 0.04 * (mod(max(audioSectionPrev, 0.0), 3.0) - 1.0), thB = 0.04 * (mod(max(audioSectionId, 0.0), 3.0) - 1.0);
    float fault = smoothstep(-0.03, 0.03, dot(p, normalize(vec2(1.0, 0.45))) - 0.12 * sin(0.05 * sceneTime));
    v += mix(thA, thB, blend) * fault;
    float N = 14.0 + 22.0 * clamp(layerP, 0.0, 1.0);
    float lay = v * N;
    vec2 uv = vec2(0.5 + 0.18 * sin(floor(lay) * 1.3) , v * 0.8 + 0.5);
    vec3 c = imgLod(uv, 4.0 + 0.0 * fract(lay));
    vec3 c2 = imgLod(vec2(p.x * 0.5 + 0.5, v * 0.8 + 0.5), 2.5);
    float joint = smoothstep(0.0, 0.08, fract(lay)) * smoothstep(1.0, 0.92, fract(lay));
    finish(mix(c, c2, 0.4) * (0.55 + 0.5 * joint) * 1.15);
}
