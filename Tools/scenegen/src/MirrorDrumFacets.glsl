//@doc
 * @brief MIRROR DRUM FACETS: a polygon mirror drum as in a laser printer: every facet shows another strip of the photo; as the drum turns the strips fold down through
 * the picture one after another, and the number of facets changes with the key, the new facet fading in.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the drum's turn (integrated)
 *   audioHarmAdvance -> the number of facets (blended, integrated)
 *   audioSwell      -> how far the strips are thrown
 *
 * Knobs: facetsP (the base number of facets), hueP.
//@params facetsP
//@audio audioSwell audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float run = 0.04 * sceneTime + 0.6 * audioAdvance;
    float nf = 4.0 + 5.0 * clamp(facetsP, 0.0, 1.0) + 1.5 * sin(0.4 * audioHarmAdvance);
    float y = p.y * 1.2 + run * 3.0;
    float cell = floor(y * nf * 0.5);
    float f = fract(y * nf * 0.5);
    float h = hash21(vec2(cell, 3.0));
    float throwv = (0.15 + 0.35 * clamp(audioSwell, 0.0, 1.0)) * (h - 0.5) * 2.0;
    float mirror = mod(cell, 2.0) < 0.5 ? 1.0 : -1.0;
    vec2 uv = vec2(p.x * 0.8 + 0.5 + 0.1 * (h - 0.5), 0.5 + mirror * (f - 0.5) * 0.6 + throwv + 0.3 * (h - 0.5));
    vec3 col = imgLod(uv, 0.5) * (0.75 + 0.35 * smoothstep(0.0, 0.1, min(f, 1.0 - f)));
    finish(col * 1.05);
}
