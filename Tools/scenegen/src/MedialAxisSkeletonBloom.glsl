//@doc
 * @brief MEDIAL AXIS SKELETON BLOOM: the medial axis: to every shape belongs a skeleton of the points with two nearest points on the edge; the picture shows skeletons of the light areas of the photo, which wander with the threshold and grow like roots in the areas.  The distance to the edge is estimated from the
 * photo's smoothed brightness (a first-order estimate), and the skeleton lies where that distance has a ridge.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the threshold: the shapes grow and shrink
 *   audioAdvance -> the threshold wanders slowly (integrated)
 *
 * Knobs: sizeP (the smoothing of the shapes), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
/**  A first-order estimate of the signed distance to the edge of the photo's light areas (brightness over gradient).
 *
 * @param uv  The photo coordinate. (in)
 * @param thr  The brightness threshold. (in)
 * @param lod  The mip level. (in)
 *
 * @return
 *   The distance, clamped.
 **/
float sdEst(vec2 uv, float thr, float lod)
{
    float e = 0.006;
    float l = luma(imgLod(uv, lod));
    float gx = luma(imgLod(uv + vec2(e, 0.0), lod)) - luma(imgLod(uv - vec2(e, 0.0), lod));
    float gy = luma(imgLod(uv + vec2(0.0, e), lod)) - luma(imgLod(uv - vec2(0.0, e), lod));
    float g = length(vec2(gx, gy)) / (2.0 * e) + 0.02;
    return clamp((l - thr) / g, -0.3, 0.3);
}
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.85 + 0.5;
    float lod = 2.0 + 1.6 * clamp(sizeP, 0.0, 1.0);
    float thr = 0.55 + 0.12 * sin(0.03 * audioAdvance + 0.04 * sceneTime) - 0.1 * clamp(audioSwell, 0.0, 1.0);
    float h = 0.012;
    float d0 = sdEst(uv, thr, lod);
    float lap = sdEst(uv + vec2(h, 0.0), thr, lod) + sdEst(uv - vec2(h, 0.0), thr, lod) + sdEst(uv + vec2(0.0, h), thr, lod) + sdEst(uv - vec2(0.0, h), thr, lod) - 4.0 * d0;
    float inside = smoothstep(0.0, 0.01, d0);
    float skel = smoothstep(0.003, 0.015, -lap) * inside * smoothstep(0.01, 0.06, d0);
    vec3 c = imgLod(uv, 0.8);
    c = mix(vec3(luma(c)), c, 1.3);
    vec3 col = c * (0.18 + 0.2 * inside) + vec3(0.02);
    col = mix(col, c * 1.7 + 0.1, skel);
    col += vec3(1.0, 0.9, 0.7) * exp(-pow(d0 / 0.01, 2.0)) * 0.15;
    finish(col);
}
