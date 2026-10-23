//@doc
 * @brief GRADIENT REFRACTION DUET: the second photo is a lens: its gradient (its edges and slopes of brightness) shifts the pixels of the first, like light passing through a sheet of glass whose thickness is the second photo's
 * brightness; the three colours are refracted a little differently, so the edges carry a fine fringe of colour, and a soft sheen follows the glass's slope.  The second photo glides slowly over the first with the drive of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the strength of the refraction
 *   audioAdvance    -> the glass glides over the picture (integrated)
 *
 * Knobs: lensP (the glass's coarseness), hueP.
//@params lensP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    vec2 gl = uv + 0.18 * vec2(sin(0.03 * audioAdvance + 0.01 * sceneTime), cos(0.025 * audioAdvance));
    float lod = 2.5 + 2.0 * clamp(lensP, 0.0, 1.0);
    float e = 0.004 * (1.0 + lod);
    vec2 g = vec2(luma(imgB(gl + vec2(e, 0.0), lod)) - luma(imgB(gl - vec2(e, 0.0), lod)),
                  luma(imgB(gl + vec2(0.0, e), lod)) - luma(imgB(gl - vec2(0.0, e), lod))) / (2.0 * e);
    float k = 0.003 + 0.009 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = vec3(imgLod(uv + g * k * 0.9, 0.7).r, imgLod(uv + g * k, 0.7).g, imgLod(uv + g * k * 1.12, 0.7).b);
    float sheen = clamp(dot(normalize(vec3(g * 0.3, 1.0)), normalize(vec3(-0.4, 0.5, 0.8))), 0.0, 1.0);
    finish(col * (0.75 + 0.5 * sheen));
}
