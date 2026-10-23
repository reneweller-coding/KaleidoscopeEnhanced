//@doc
 * @brief CONTOUR PARALLEL ECHOES: parallel contours: from the edge of an area lines run out at equal distances, narrowing and closing at corners; the photo supplies the edges, and the distances breathe.  The distance to the edge of the photo's light areas (a first-order estimate) is cut into level lines inside and outside;
 * the lines take the photo's colour, and their spacing follows the swell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the spacing of the lines
 *   audioAdvance -> the lines run (outwards and inwards) (integrated)
 *
 * Knobs: sizeP (the smoothing of the shapes), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.85 + 0.5;
    float lod = 2.0 + 1.8 * clamp(sizeP, 0.0, 1.0);
    float thr = 0.52;
    float e = 0.006;
    float l = luma(imgLod(uv, lod));
    float gx = luma(imgLod(uv + vec2(e, 0.0), lod)) - luma(imgLod(uv - vec2(e, 0.0), lod));
    float gy = luma(imgLod(uv + vec2(0.0, e), lod)) - luma(imgLod(uv - vec2(0.0, e), lod));
    float g = length(vec2(gx, gy)) / (2.0 * e) + 0.02;
    float d = clamp((l - thr) / g, -0.5, 0.5);
    float sp = 0.012 + 0.03 * clamp(audioSwell, 0.0, 1.0);
    float s = d / sp - 0.04 * audioAdvance - 0.06 * sceneTime;
    float fr = abs(fract(s) - 0.5) * 2.0;
    float line = 1.0 - smoothstep(0.1, 0.25, fr);
    vec3 c = imgLod(uv, 0.8);
    c = mix(vec3(luma(c)), c, 1.4);
    float inside = smoothstep(-0.01, 0.01, d);
    vec3 bg = mix(vec3(0.03, 0.03, 0.05), c * 0.2, 0.6);
    vec3 lc = mix(c * 1.6 + 0.1, vec3(1.0, 0.95, 0.85), 0.2 * inside);
    vec3 col = mix(bg, lc, line * (1.0 - 0.5 * smoothstep(0.3, 0.5, abs(d))));
    col += c * 0.12 * inside;
    finish(col);
}
