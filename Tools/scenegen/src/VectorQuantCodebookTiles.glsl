//@doc
 * @brief VECTOR QUANT CODEBOOK TILES: vector quantisation: the photo consists of tiles that all come from a codebook of simple patterns (a mean colour and a ramp of some direction and strength), and every tile takes the most similar pattern.  The codebook's size glides, so the
 * pictures snaps into fewer and fewer, then more and more directions, softly mixed between neighbouring sizes.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the size of the codebook glides (integrated)
 *   audioSwell       -> the strength of the ramps
 *
 * Knobs: sizeP (the tile size), hueP.
//@params sizeP
//@audio audioSwell audioHarmAdvance
//@body
vec3 codeTile(vec2 f, vec3 m, vec2 grad, float N, float Nc, float gain)
{
    float th = atan(grad.y, grad.x);
    float dth = 6.2831853 / N;
    float t = th / dth;
    float i0 = floor(t);
    float w = smoothstep(0.35, 0.65, fract(t));
    float thq = (i0 + w) * dth;
    float mag = length(grad) * gain;
    float magq = floor(mag * 3.0) / 3.0 + smoothstep(0.35, 0.65, fract(mag * 3.0)) / 3.0;
    vec3 x = m * Nc;
    vec3 mq = (floor(x) + smoothstep(0.3, 0.7, fract(x))) / Nc;
    return mq + magq * dot(f - 0.5, vec2(cos(thq), sin(thq))) * 2.0;
}
void main()
{
    vec2 fc = gl_FragCoord.xy;
    float px = resolution.y / 270.0;
    float T = (11.0 + 12.0 * clamp(sizeP, 0.0, 1.0)) * px;
    vec2 cell = floor(fc / T);
    vec2 f = fract(fc / T);
    vec2 org = cell * T;
    vec3 a = imgLod(((org + vec2(0.25, 0.25) * T) - 0.5 * resolution) / resolution.y * 0.8 + 0.5, log2(T / px / 2.0));
    vec3 b = imgLod(((org + vec2(0.75, 0.25) * T) - 0.5 * resolution) / resolution.y * 0.8 + 0.5, log2(T / px / 2.0));
    vec3 c = imgLod(((org + vec2(0.25, 0.75) * T) - 0.5 * resolution) / resolution.y * 0.8 + 0.5, log2(T / px / 2.0));
    vec3 d = imgLod(((org + vec2(0.75, 0.75) * T) - 0.5 * resolution) / resolution.y * 0.8 + 0.5, log2(T / px / 2.0));
    vec3 m = 0.25 * (a + b + c + d);
    vec2 grad = vec2(luma((b + d) - (a + c)), luma((c + d) - (a + b))) * 0.5;
    float e = 5.0 * (0.5 + 0.5 * sin(0.08 * audioHarmAdvance + 0.03 * sceneTime));
    float N0 = 3.0 + floor(e);
    float fe = smoothstep(0.0, 1.0, fract(e));
    float gain = 1.4 + 1.2 * clamp(audioSwell, 0.0, 1.0);
    float Nc = 3.0 + floor(e) * 0.5;
    vec3 c0 = codeTile(f, m, grad, N0, Nc, gain);
    vec3 c1 = codeTile(f, m, grad, N0 + 1.0, Nc + 0.5, gain);
    vec3 col = mix(c0, c1, fe);
    float edge = smoothstep(0.0, 0.04, f.x) * smoothstep(0.0, 0.04, f.y);
    finish(max(col, vec3(0.0)) * (0.88 + 0.12 * edge) * 1.1);
}
