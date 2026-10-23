//@doc
 * @brief ADAM SEVEN PASS REVEAL: the progressive image build-up of PNG files: the photo builds itself in seven passes that interlock, first coarse blocks, then the lines between, until every pixel stands; here it runs as an endless loop of build-up and tear-down.  Between two
 * passes the blocks of the two neighbouring stages are blended, so no step is a jump.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos -> the pass in force (periodic over the phrase)
 *   audioAdvance   -> the photo drifts slowly behind the blocks (integrated)
 *
 * Knobs: sizeP (the size of the base cell), hueP.
//@params sizeP
//@audio audioAdvance audioPhrasePos
//@body
vec3 adamStage(vec2 fc, int s, float U, float px, vec2 sh)
{
    float bw = 8.0 / exp2(ceil(float(s) * 0.5));
    float bh = 8.0 / exp2(floor(float(s) * 0.5));
    vec2 bs = vec2(bw, bh) * U;
    vec2 cell = floor(fc / bs);
    vec2 cc = (cell + 0.5) * bs;
    float sz = max(bs.x, bs.y) / px;
    return imgLod((cc - 0.5 * resolution) / resolution.y * 0.85 + 0.5 + sh, max(log2(sz) - 0.8, 0.0));
}
void main()
{
    vec2 fc = gl_FragCoord.xy;
    float px = resolution.y / 270.0;
    float U = (1.2 + 1.8 * clamp(sizeP, 0.0, 1.0)) * px;
    vec2 sh = 0.03 * vec2(sin(0.02 * audioAdvance + 0.04 * sceneTime), cos(0.017 * audioAdvance));
    float st = 6.0 * (0.5 - 0.5 * cos(6.2831853 * audioPhrasePos));
    int s0 = int(floor(st));
    float f = smoothstep(0.0, 1.0, fract(st));
    vec3 a = adamStage(fc, s0, U, px, sh);
    vec3 b = adamStage(fc, min(s0 + 1, 6), U, px, sh);
    finish(mix(a, b, f) * 1.1);
}
