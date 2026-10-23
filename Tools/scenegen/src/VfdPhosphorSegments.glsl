//@doc
 * @brief VFD PHOSPHOR SEGMENTS: a vacuum fluorescent display: the photo is mapped onto a few segments per cell, glowing in cold green-blue with an afterglow; each cell draws a stroke along the edge that runs through it, so the picture becomes a field of small
 * strokes and its edges stand as lines of strokes.  The cell size glides.
 *
 * Audio Reactivity (structure, not only light):
 *   audioRolloff  -> the afterglow's length
 *   audioAdvance  -> the cell size and the photo's drift (integrated)
 *
 * Knobs: sizeP (the largest cell), hueP.
//@params sizeP
//@audio audioRolloff audioAdvance
//@body
/**  The stroke of one cell of the display: a bar along the edge through the cell, glowing, with a dim dot.
 *
 * @param fc  The pixel coordinate. (in)
 * @param C  The cell size in pixels. (in)
 * @param sh  The shift of the photo. (in)
 *
 * @return
 *   The brightness.
 **/
vec3 strokeAt(vec2 fc, float C, vec2 sh)
{
    vec2 cell = floor(fc / C);
    vec2 cc = (cell + 0.5) * C;
    vec2 f = fc - cc;
    vec2 pc = (cc - 0.5 * resolution) / resolution.y * 0.8 + 0.5 + sh;
    float lod = log2(C * 270.0 / resolution.y) - 0.3;
    float e = 1.5 / resolution.y * C;
    float gx = luma(imgLod(pc + vec2(e, 0.0), lod)) - luma(imgLod(pc - vec2(e, 0.0), lod));
    float gy = luma(imgLod(pc + vec2(0.0, e), lod)) - luma(imgLod(pc - vec2(0.0, e), lod));
    float mag = clamp(length(vec2(gx, gy)) * 6.0, 0.0, 1.0);
    float l = luma(imgLod(pc, lod));
    vec2 t = normalize(vec2(-gy, gx) + vec2(1e-4));
    float along = dot(f, t);
    float across = dot(f, vec2(-t.y, t.x));
    float len = C * (0.15 + 0.35 * mag);
    float seg = (1.0 - smoothstep(len - 0.5, len + 0.5, abs(along))) * (1.0 - smoothstep(0.08 * C, 0.16 * C, abs(across)));
    float fill = (1.0 - smoothstep(0.06 * C, 0.14 * C, length(f))) * l * l * 0.45;
    return vec3(seg * smoothstep(0.08, 0.55, mag) * (0.3 + 0.9 * l) + fill);
}
void main()
{
    vec2 fc = gl_FragCoord.xy;
    float C = exp(mix(log(8.0), log(14.0 + 22.0 * clamp(sizeP, 0.0, 1.0)), 0.5 + 0.5 * sin(0.04 * audioAdvance + 0.04 * sceneTime))) * resolution.y / 270.0;
    vec2 sh = 0.02 * vec2(sin(0.05 * sceneTime), cos(0.04 * sceneTime));
    float a = strokeAt(fc, C, sh).x;
    float b = strokeAt(fc, C, sh + 0.02 * vec2(cos(0.05 * sceneTime), sin(0.04 * sceneTime))).x;
    float ag = 0.35 + 0.5 * clamp(audioRolloff, 0.0, 1.0);
    float v = max(a, ag * b);
    vec3 col = vec3(0.2, 1.0, 0.8) * v;
    col += vec3(0.0, 0.05, 0.08);
    finish(col * 1.2);
}
