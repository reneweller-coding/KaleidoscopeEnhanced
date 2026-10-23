//@doc
 * @brief BAYER DITHER TIDE: ordered dithering with Bayer matrices that glide in size between 2x2 and 16x16: the threshold rises and falls like a tide and the photo emerges as a pattern of dots
 * and dissolves again; every colour channel is cut to a few levels by the same threshold pattern, so the dots are the photo's own colours.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> the matrix size (it glides, the larger one fading in)
 *   audioSwell      -> the threshold's tide
 *
 * Knobs: levelsP (the number of colour levels), grainP (the dots' size), hueP.
//@params levelsP grainP
//@audio audioSpread audioSwell
//@body
/**  The Bayer threshold of a pixel for a matrix of 2^n by 2^n.
 *
 * @param q  The pixel. (in)
 * @param n  The number of levels of the matrix, 1..4. (in)
 *
 * @return
 *   The threshold, 0..1.
 **/
float bayerAt(ivec2 q, int n)
{
    int v = 0;
    for (int i = 0; i < 4; ++i) {
        if (i >= n) break;
        int xb = (q.x >> i) & 1, yb = (q.y >> i) & 1;
        int sh = 2 * (n - 1 - i);
        v |= (yb << (sh + 1)) | ((xb ^ yb) << sh);
    }
    return (float(v) + 0.5) / float(1 << (2 * n));
}
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = sceneTime * 0.2 + 1.5 * audioAdvance;
    float nsz = 1.0 + 3.0 * clamp(0.6 * clamp(audioSpread, 0.0, 1.0) + 0.4 * (0.5 + 0.5 * sin(0.3 * t)), 0.0, 1.0);
    int n0 = int(floor(nsz));
    float fr = fract(nsz);
    float cellsz = 1.0 + 3.0 * clamp(grainP, 0.0, 1.0);
    ivec2 q = ivec2(floor(gl_FragCoord.xy / cellsz));
    float th = mix(bayerAt(q, n0), bayerAt(q, min(n0 + 1, 4)), smoothstep(0.3, 0.7, fr));
    float tide = 0.5 * sin(0.5 * t) * (0.4 + clamp(audioSwell, 0.0, 1.0));
    float lv = 2.0 + 3.0 * clamp(levelsP, 0.0, 1.0);
    vec3 c = imgLod(uv, 1.0);
    vec3 col = floor(c * (lv - 1.0) + th + tide * 0.5) / (lv - 1.0);
    finish(clamp(col, 0.0, 1.0) * 1.05);
}
