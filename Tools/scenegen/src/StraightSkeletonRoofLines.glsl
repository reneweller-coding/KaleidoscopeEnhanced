//@doc
 * @brief STRAIGHT SKELETON ROOF LINES: the straight skeleton: a polygon shrinks with equal speed of its edges, and the corners draw ridge lines; roofs lie over the areas of the photo, and their height wanders.  The distance to the edge (estimated from the photo's smoothed brightness) gives the height of the roof, whose
 * level lines are eaves and whose slope is lit from one side like roof tiles.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the height wanders (the level lines run inwards) (integrated)
 *   audioSwell   -> the steepness of the roofs
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
float sdE(vec2 uv, float thr, float lod)
{
    float e = 0.006;
    float l = luma(imgLod(uv, lod));
    float gx = luma(imgLod(uv + vec2(e, 0.0), lod)) - luma(imgLod(uv - vec2(e, 0.0), lod));
    float gy = luma(imgLod(uv + vec2(0.0, e), lod)) - luma(imgLod(uv - vec2(0.0, e), lod));
    float g = length(vec2(gx, gy)) / (2.0 * e) + 0.02;
    return clamp((l - thr) / g, -0.4, 0.4);
}
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.85 + 0.5;
    float lod = 2.2 + 1.6 * clamp(sizeP, 0.0, 1.0);
    float thr = 0.5;
    float d = sdE(uv, thr, lod);
    float e = 0.008;
    float dx = sdE(uv + vec2(e, 0.0), thr, lod) - sdE(uv - vec2(e, 0.0), thr, lod);
    float dy = sdE(uv + vec2(0.0, e), thr, lod) - sdE(uv - vec2(0.0, e), thr, lod);
    vec2 gr = vec2(dx, dy) / (2.0 * e);
    float steep = 0.5 + 1.0 * clamp(audioSwell, 0.0, 1.0);
    vec3 n = normalize(vec3(-gr * 0.08 * steep, 1.0));
    float lit = 0.35 + 0.9 * max(dot(n, normalize(vec3(-0.5, 0.6, 0.65))), 0.0);
    float H = d * 28.0 - 0.02 * audioAdvance - 0.03 * sceneTime;
    float eave = 1.0 - smoothstep(0.0, 0.08, abs(fract(H) - 0.5) * 2.0 - 0.0) * 0.0;
    float lines = 1.0 - smoothstep(0.0, 0.09, abs(fract(H) - 0.5) * 2.0 - 0.82) * 1.0;
    float roof = smoothstep(-0.005, 0.01, d);
    vec3 c = imgLod(uv, 0.8);
    c = mix(vec3(luma(c)), c, 1.3);
    vec3 tiles = c * lit * 1.2 * (0.85 + 0.2 * (1.0 - abs(fract(H) - 0.5) * 0.6));
    vec3 ground = c * 0.28 + vec3(0.02);
    vec3 col = mix(ground, tiles, roof);
    col *= 1.0 - 0.3 * smoothstep(0.7, 1.0, abs(fract(H) - 0.5) * 2.0) * roof;
    finish(col * 1.1);
}
