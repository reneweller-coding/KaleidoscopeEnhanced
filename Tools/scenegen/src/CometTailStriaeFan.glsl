//@doc
 * @brief COMET TAIL STRIAE FAN: comet tails: a dust tail with striae that come from outbursts, and an ion tail with knots; the photo is the colour of the dust grains, and the striae fan out.  The head glows at one side; behind it a curved fan of fine lines, every line bent by the radiation pressure on its grains,
 * and a thin straight blue tail with knots that run outwards.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread  -> the number of striae (smoothed)
 *   audioAdvance -> the knots of the ion tail run outwards and the fan breathes (integrated)
 *
 * Knobs: sizeP (the width of the fan), hueP.
//@params sizeP
//@audio audioSpread audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    vec2 head = vec2(-0.55, 0.25);
    vec2 d = p - head;
    float r = length(d);
    float a = atan(d.y, d.x);
    float base = -0.35;
    float fan = 0.25 + 0.5 * clamp(sizeP, 0.0, 1.0);
    float curve = 0.9 * r;
    float aa = a - base - curve;
    float inFan = exp(-pow(aa / fan, 2.0)) * smoothstep(0.03, 0.15, r) * exp(-r * 0.9);
    float N = 30.0 + 40.0 * clamp(audioSpread, 0.0, 1.0);
    float s = (aa / fan) * N * 0.5 + 0.1 * sin(0.03 * audioAdvance);
    float stria = pow(0.5 + 0.5 * sin(6.2831853 * s * 0.5), 3.0) * (0.5 + 0.5 * noise2(vec2(floor(s) * 3.0, r * 4.0)));
    vec3 c = imgLod(p * 0.85 + 0.5, 1.0);
    vec3 dust = mix(vec3(1.0, 0.9, 0.7), mix(vec3(luma(c)), c, 1.5), 0.55);
    vec3 col = c * 0.1 + vec3(0.01, 0.015, 0.03);
    col += dust * inFan * (0.3 + 1.1 * stria);
    float ion = exp(-pow((a - base * 1.0 + 0.0) / 0.03, 2.0)) * smoothstep(0.03, 0.2, r) * exp(-r * 0.6);
    float knot = 0.5 + 0.5 * sin(30.0 * r - 0.5 * audioAdvance * 0.2 - 2.0 * sceneTime);
    col += vec3(0.3, 0.55, 1.0) * ion * (0.4 + 0.9 * knot);
    float head_ = exp(-r * r / 0.0016) + 0.3 * exp(-r * r / 0.02);
    col += vec3(1.0, 0.95, 0.85) * head_;
    finish(col * 1.1);
}
