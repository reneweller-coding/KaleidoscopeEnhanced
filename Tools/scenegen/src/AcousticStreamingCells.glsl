//@doc
 * @brief ACOUSTIC STREAMING CELLS: a field of vibrating drops packed close together; inside each, sound drives a
 * steady streaming flow in lobed cells, and glowing particles circle along those cells, tracing their loops.  A
 * drop's rim trembles in its own mode; its particles each run round a closed streamline -- a rose of n lobes,
 * r = R (0.55 + 0.35 sin(n theta + phi)) -- at their own speed, drawn as round points with short tails.  The light
 * is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the number of streaming cells glides with the chord changes (the light cross-faded)
 *   audioSwell       -> the streaming's speed
 *   audioAdvance     -> the particles run (integrated)
 *
 * Knobs: dropP (the drops' size), particleP (how many particles per drop), hueP.
//@params dropP particleP
//@audio audioHarmAdvance audioSwell
//@body
/**  A drop's particles' light for one lobe count.
 *
 * @param q     The point (drop centre at 0, radius 1). (in)
 * @param n     The lobes. (in)
 * @param M     How many particles. (in)
 * @param run   The particles' run. (in)
 * @param seed  The drop's own pattern. (in)
 *
 * @return
 *   The light.
 **/
float streaming(vec2 q, float n, float M, float run, float seed)
{
    float light = 0.0;
    for (int i = 0; i < 30; ++i) {
        float fi = float(i);
        if (fi >= M) break;
        float h1 = fract(sin(fi * 12.9898 + seed) * 43758.5453), h2 = fract(sin(fi * 78.233 + seed) * 43758.5453);
        float lvl = 0.25 + 0.6 * h1;                             // which streamline
        for (int k = 0; k < 3; ++k) {
            float th = run * (0.5 + h2) + 6.2831853 * h2 - 0.06 * float(k);
            float r = lvl * (0.55 + 0.35 * sin(n * th + 6.2831853 * seed));
            vec2 x = r * vec2(cos(th), sin(th));
            float d = length(q - x);
            light += (k == 0 ? 1.0 : 0.35 / float(k)) * (smoothstep(0.05, 0.025, d) + 0.2 * exp(-d / 0.06));
        }
    }
    return light;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float hk = floor(h), hm = smoothstep(0.15, 0.85, h - hk);
    float S = 0.3 + 0.15 * clamp(dropP, 0.0, 1.0);
    float M = floor(14.0 + 14.0 * clamp(particleP, 0.0, 1.0));
    float run = 0.3 * sceneTime + 1.2 * audioAdvance * (0.6 + 0.8 * clamp(audioSwell, 0.0, 1.0));
    vec2 r2 = vec2(1.0, 1.7320508);
    vec2 g = p / S;
    vec2 a = mod(g, r2) - 0.5 * r2, b = mod(g - 0.5 * r2, r2) - 0.5 * r2;
    vec2 q = dot(a, a) < dot(b, b) ? a : b;
    vec2 cid = g - q;
    float hc = fract(sin(dot(cid, vec2(12.9898, 78.233))) * 43758.5453);
    float R = 0.46;
    // the drop's trembling rim
    float th = atan(q.y, q.x);
    float rim = R * (1.0 + 0.04 * sin((3.0 + floor(hc * 4.0)) * th + 3.0 * sceneTime * (0.5 + hc)));
    vec2 qd = q / rim;
    float nA = 3.0 + mod(hk + floor(hc * 3.0), 4.0), nB = 3.0 + mod(hk + 1.0 + floor(hc * 3.0), 4.0);
    float l = streaming(qd, nA, M, run, hc) * (1.0 - hm);
    if (hm > 0.002) l += streaming(qd, nB, M, run, hc) * hm;
    vec3 col = famLight(fh, 0.2 + 0.6 * hc, 0.3) * l * 0.5 * step(length(qd), 1.0);
    col += famCol(fh, 0.5) * exp(-abs(length(q) - rim) / 0.006) * 0.25;   // the drop's surface
    finish(col);
}
