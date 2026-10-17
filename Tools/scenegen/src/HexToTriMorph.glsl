//@doc
 * @brief HEX TO TRI MORPH: three families of parallel lines, sixty degrees apart, sliding against each other -- when
 * they meet in common points they cut the plane into triangles; when each family is shifted by half a spacing they
 * cut it into the kagome pattern of hexagons and triangles; drop the triangles' outlines and hexagons remain.  The
 * families slide continuously between these, so the tiling morphs from triangles through kagome to hexagons and
 * back.  The cells hold the photo, the triangles and hexagons in two cuts.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSectionId  -> each section moves to the next stage (triangles, kagome, hexagons; gliding over four seconds)
 *   audioPhase      -> the pattern turns (integrated)
 *   audioKick       -> the lines flash (light)
 *
 * Knobs: sizeP (cell size), lineP (line width), photoP (photo share), hueP.
//@params sizeP lineP photoP
//@audio audioKick audioSectionId audioSectionAge
//@body
void main()
{
    vec2 p = rot2(0.02 * audioPhase + 0.004 * sceneTime) * screenP();
    float sz = 0.08 + 0.1 * clamp(sizeP, 0.0, 1.0);
    vec2 x = p / sz;
    // the stage: 0 triangles, 1 kagome, 2 hexagons, gliding
    float k = max(audioSectionId, 0.0);
    float now = mod(k, 3.0), before = mod(k + 2.0, 3.0);
    float m = audioSectionId < 0.5 ? 1.0 : smoothstep(0.0, 4.0, audioSectionAge);
    float stage = mix(before, now, m);
    if (abs(now - before) > 1.5) stage = mix(before, before + 1.0, m);   // 2 -> 0 glides on through 3 (= 0)
    float shift = 0.5 * clamp(stage, 0.0, 1.0);                // the families' offset: 0 triangles, 1/2 kagome
    float hideTri = clamp(stage - 1.0, 0.0, 1.0) * (stage < 2.5 ? 1.0 : 3.0 - stage);
    float sumK = 0.0, dmin = 1e9;
    for (int i = 0; i < 3; ++i) {
        float a = 2.0943951 * float(i);
        float s = dot(x, vec2(cos(a), sin(a))) + shift;
        sumK += floor(s);
        dmin = min(dmin, min(fract(s), 1.0 - fract(s)));
    }
    // in the kagome stage the small triangles are the cells whose indices sum to an odd count
    float isTri = mod(sumK, 2.0) > 0.5 ? 1.0 : 0.0;
    vec2 uv = p * 0.7 + 0.5;
    vec3 hexCol = imgLod(uv, 0.5), triCol = imgLod(uv * 1.3 + vec2(0.3, 0.2), 0.5);
    vec3 tone = imgPalette(0.2 + 0.4 * isTri + 0.03 * audioPhase);
    vec3 col = mix(hexCol, mix(triCol, triCol * tone * 1.5, 0.3), isTri * (1.0 - hideTri));
    col = mix(col, col * tone * 1.6, 0.2 * (1.0 - clamp(photoP, 0.0, 1.0)));
    float lw = 0.03 + 0.05 * clamp(lineP, 0.0, 1.0);
    float line = (1.0 - smoothstep(lw * 0.5, lw, dmin)) * (1.0 - hideTri * isTri);
    col = mix(col, mix(tone, vec3(1.0), 0.5) * (0.5 + 0.7 * clamp(audioKick, 0.0, 1.0)), line * 0.8);
    finish(col);
}
