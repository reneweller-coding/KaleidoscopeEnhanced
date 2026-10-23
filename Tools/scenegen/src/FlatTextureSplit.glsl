//@doc
 * @brief FLAT TEXTURE SPLIT: the photo split by its local scatter into two sheets -- the smooth areas (sky, wall, skin) as
 * one blanket, the textured ones (foliage, stone, hair) as another -- and the two sheets slide past each other in opposite
 * directions with soft seams between.  Where they overlap the textured sheet lies on top.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> the threshold between smooth and rough moves with it
 *   audioAdvance    -> the sheets' sliding (integrated)
 *   audioSwell      -> how far they slide
 *
 * Knobs: reachP (how far the sheets slide), splitP (the base threshold), hueP.
//@params reachP splitP
//@audio audioSpread audioSwell
//@body
/**  How textured the photo is at a place (0 smooth, 1 rough): the local scatter of its brightness.
 *
 * @param uv  The place. (in)
 * @param th  The threshold between smooth and rough. (in)
 *
 * @return
 *   The mask, 0..1.
 **/
float texMask(vec2 uv, float th)
{
    vec2 e = vec2(0.012, 0.0);
    float c = luma(imgLod(uv, 1.0));
    float s = abs(luma(imgLod(uv + e.xy, 1.0)) - c) + abs(luma(imgLod(uv - e.xy, 1.0)) - c)
            + abs(luma(imgLod(uv + e.yx, 1.0)) - c) + abs(luma(imgLod(uv - e.yx, 1.0)) - c);
    s = 0.5 * s + abs(luma(imgLod(uv, 0.0)) - luma(imgLod(uv, 2.5)));
    return smoothstep(th - 0.04, th + 0.04, s);
}
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = sceneTime * 0.5 + 3.0 * audioAdvance;
    float th = 0.025 + 0.07 * clamp(splitP, 0.0, 1.0) + 0.04 * clamp(audioSpread, 0.0, 1.0);
    float reach = (0.4 + 0.8 * clamp(reachP, 0.0, 1.0)) * (0.5 + 0.7 * clamp(audioSwell, 0.0, 1.0));
    vec2 dir = vec2(cos(0.05 * t), sin(0.05 * t));
    vec2 dA = dir * reach * 0.22 * sin(0.4 * t + 1.0);
    vec2 dB = -dA;
    vec2 uB = uv + dB, uA = uv + dA;
    float mB = texMask(uB, th);
    vec3 col = mix(imgLod(uA, 0.4), imgLod(uB, 0.4), mB);
    float seam = mB * (1.0 - mB) * 4.0;
    col *= 1.0 - 0.18 * seam;
    finish(col * 1.05);
}
