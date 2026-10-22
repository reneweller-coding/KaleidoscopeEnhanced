//@doc
 * @brief ZERO GRAVITY DROPLET MERGE: coloured droplets float weightless in the dark, wobbling, touching and flowing into
 * one another as they drift, streaks of their colours swirling inside the merged drops; the bass sets them trembling.
 * The droplets are a metaball field, each ball's radius rippling round it (a two- and a three-lobed wobble); where the
 * field passes one the liquid is, lit from the field's gradient with a glossy highlight and a bright rim; its colour is
 * the balls' colours weighted by their shares, stirred into streaks by drifting noise.  The colours come from the
 * photo's colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBass    -> the droplets' trembling (softened by the swell)
 *   audioAdvance -> the droplets drift and the streaks swirl (integrated)
 *   audioSwell   -> the liquid's glow
 *
 * Knobs: dropP (how many droplets), sizeP (their size), hueP.
//@params dropP sizeP
//@audio audioBass audioSwell
//@body
/**  The liquid's field and colour sum at a place.
 *
 * @param p     The place. (in)
 * @param N     The number of droplets. (in)
 * @param R0    Their base radius. (in)
 * @param wob   The wobble's depth. (in)
 * @param run   The drift's progress. (in)
 * @param fh    The colour family's hue. (in)
 *
 * @return
 *   xyz the colour sum, w the field.
 **/
vec4 liquid(vec2 p, float N, float R0, float wob, float run, float fh)
{
    vec4 acc = vec4(0.0);
    for (int i = 0; i < 9; ++i) {
        float fi = float(i);
        if (fi >= N) break;
        float h1 = fract(sin(fi * 12.9898) * 43758.5453), h2 = fract(sin(fi * 78.233) * 43758.5453);
        vec2 c = vec2(0.7 * sin(run * (0.3 + 0.2 * h1) + 6.2831853 * h2), 0.35 * sin(run * (0.25 + 0.2 * h2) + 6.2831853 * h1));
        vec2 d = p - c;
        float an = atan(d.y, d.x);
        float r = R0 * (0.7 + 0.6 * h2) * (1.0 + wob * (sin(2.0 * an + 3.0 * run + 6.0 * h1) + 0.5 * sin(3.0 * an - 2.3 * run)));
        float f = r * r / (dot(d, d) + 1e-4);
        acc += vec4(famLight(fh, h1, 0.15) * f, f);
    }
    return acc;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float N = floor(6.0 + 3.0 * clamp(dropP, 0.0, 1.0));
    float R0 = 0.07 + 0.04 * clamp(sizeP, 0.0, 1.0);
    float sw = clamp(audioSwell, 0.0, 1.0);
    float wob = 0.03 + 0.1 * mix(sw, clamp(audioBass, 0.0, 1.0), 0.4);
    float run = 0.04 * sceneTime + 0.16 * audioAdvance;
    vec4 a = liquid(p, N, R0, wob, run, fh);
    const float e = 0.002;
    vec2 gr = vec2(liquid(p + vec2(e, 0.0), N, R0, wob, run, fh).w - a.w, liquid(p + vec2(0.0, e), N, R0, wob, run, fh).w - a.w) / e;
    float inside = smoothstep(0.95, 1.08, a.w);
    vec3 n = normalize(vec3(-gr * 0.015, 1.0));
    vec3 base = a.xyz / max(a.w, 1e-4);
    vec3 alt = famLight(fract(fh + 0.08), 0.6, 0.2);
    base = mix(base, alt, 0.35 * smoothstep(0.45, 0.75, fbm(6.0 * p + vec2(run, -0.7 * run))));   // the swirling streaks
    float dif = 0.35 + 0.65 * max(dot(n, normalize(vec3(-0.4, 0.6, 0.7))), 0.0);
    float spec = pow(max(dot(n, normalize(vec3(-0.4, 0.6, 1.7))), 0.0), 50.0);
    float rim = pow(1.0 - n.z, 2.0);
    vec3 col = famCol(fh, 0.45) * 0.015;
    col = mix(col, base * dif * (0.6 + 0.6 * sw) + vec3(1.0) * spec * 0.7 + famLight(fh, 0.5, 0.6) * rim * 0.4, inside);
    finish(famExpose(col, 3.13, 0.70, 0.05, fh));
}
