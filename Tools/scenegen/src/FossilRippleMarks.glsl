//@doc
 * @brief FOSSIL RIPPLE MARKS: fossil ripple marks: wave ripples in sand, later turned to stone, with forks and tongues; the photo gives the colour of the sediments, and the ripples travel like a swell.  The crests are the level lines of a wave field whose phase is bent by a noise field, which makes the forks and
 * the tongues; the lit side and the shaded side of every crest are painted in two tones.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread  -> the spacing of the crests (smoothed)
 *   audioAdvance -> the swell travels (integrated)
 *
 * Knobs: sizeP (the base spacing), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
float ripple(vec2 p, float k, float t)
{
    vec2 q = p;
    q += 0.12 * vec2(fbm(p * 2.0 + vec2(0.0, 0.02 * t)), fbm(p * 2.0 + vec2(5.0, -0.02 * t))) - 0.06;
    return k * (q.x * 0.8 + q.y * 0.45) + 1.4 * fbm(q * 3.0) - 0.15 * t;
}
void main()
{
    vec2 p = screenP();
    float k = 16.0 + 18.0 * (1.0 - clamp(sizeP, 0.0, 1.0)) + 5.0 * clamp(audioSpread, 0.0, 1.0);
    float t = 0.5 * audioAdvance + 0.5 * sceneTime;
    float ph = ripple(p, k, t);
    float e = 0.004;
    float ph2 = ripple(p + vec2(e, e) * 0.0 + vec2(0.0, e), k, t);
    float w = 0.5 + 0.5 * sin(6.2831853 * ph);
    float dw = cos(6.2831853 * ph);
    vec3 c = imgLod(p * 0.85 + 0.5, 0.8);
    c = mix(vec3(luma(c)), c, 0.9);
    vec3 sand = mix(vec3(0.55, 0.45, 0.32), c * 1.1, 0.5);
    vec3 lit = sand * 1.3;
    vec3 shade = sand * 0.55;
    vec3 col = mix(shade, lit, smoothstep(-0.8, 0.8, dw)) * (0.8 + 0.3 * w);
    col *= 0.9 + 0.2 * noise2(p * 300.0);
    finish(col * 1.1);
}
