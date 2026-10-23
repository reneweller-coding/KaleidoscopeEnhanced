//@doc
 * @brief PENROSE STAIR LOOP TILES: Penrose stairs: an impossible staircase that returns into itself; the photo lies on the steps, which lead endlessly upwards in a square, repeated in tiles.  Each tile holds a square ring of steps whose treads are bright and whose risers are dark; the brightness round the ring cycles four times,
 * so that the ring seems to climb all the way round.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the steps run round the ring (integrated)
 *   audioSpread  -> the number of steps (smoothed)
 *
 * Knobs: sizeP (the size of the tiles), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.5 + 0.35 * clamp(sizeP, 0.0, 1.0);
    vec2 q = p / S;
    vec2 ci = floor(q + 0.5);
    vec2 f = (q - ci);
    float cheb = max(abs(f.x), abs(f.y));
    float a = atan(f.y, f.x);
    float nst = 16.0 + 16.0 * clamp(audioSpread, 0.0, 1.0);
    float run = 0.01 * audioAdvance + 0.02 * sceneTime;
    float u = a / 6.2831853 * nst + run * nst * 0.0 - run * 4.0;
    float k = floor(u);
    float fr = fract(u);
    float ring = smoothstep(0.17, 0.2, cheb) * (1.0 - smoothstep(0.43, 0.46, cheb));
    float tread = smoothstep(0.0, 0.05, fr) * (1.0 - smoothstep(0.62, 0.66, fr));
    float side = floor(mod((a + 3.1415927 + 0.785398) / 1.5707963, 4.0));
    float rise = 0.55 + 0.45 * mod(k, 2.0) * 0.0;
    float cycle = 0.5 + 0.5 * cos(a * 1.0 - 0.0);
    float b = 0.55 + 0.45 * (0.5 + 0.5 * cos(4.0 * 0.0 + (u / nst) * 6.2831853 * 1.0 * 0.0 + a));
    float shade = tread > 0.5 ? 1.1 : 0.5;
    vec2 pc = (ci * S) + f * S;
    vec3 c = imgLod(pc * 0.85 + 0.5, 0.8);
    c = mix(vec3(luma(c)), c, 1.3);
    float ramp = 0.6 + 0.5 * fract(a / 6.2831853 * 4.0 + 0.5 - run * 2.0);
    vec3 col = c * (tread * 1.15 + (1.0 - tread) * 0.45) * ramp;
    vec3 bg = imgLod(p * 0.85 + 0.5, 2.0) * 0.18;
    float inner = smoothstep(0.17, 0.14, cheb);
    finish(mix(bg, col * 1.2, ring));
}
