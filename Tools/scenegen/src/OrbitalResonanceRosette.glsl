//@doc
 * @brief ORBITAL RESONANCE ROSETTE: a tiled field of planet pairs in resonance -- the inner and outer planet's periods
 * in a ratio like Venus and Earth's 8:13 -- and in each cell the lines drawn between the two planets at regular
 * moments build up a rose (for Venus and Earth, the famous five-petalled one); every cell closes on its own ratio,
 * and together they weave a carpet of lines.  Sixty lines per cell, each from P1(t) = r1 e^(i w1 t) to
 * P2(t) = r2 e^(i w2 t) at its own moment, glowing faintly; where many cross, the rose appears.  The lines' light is
 * shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the ratios shift with the chord changes (the light of two roses cross-faded)
 *   audioAdvance     -> the planets run on (integrated): the moments slide, the rose turns
 *   audioSwell       -> the lines' glow
 *
 * Knobs: lineP (how many lines per cell), cellP (the cells' size), hueP.
//@params lineP cellP
//@audio audioHarmAdvance audioSwell
//@body
/**  A resonance rose's light.
 *
 * @param q      The point (cell units). (in)
 * @param ratio  The periods' ratio (w2 / w1). (in)
 * @param n      How many lines. (in)
 * @param run    The planets' phase. (in)
 *
 * @return
 *   The light.
 **/
float rose(vec2 q, float ratio, float n, float run)
{
    float light = 0.0;
    for (int i = 0; i < 80; ++i) {
        float fi = float(i);
        if (fi >= n) break;
        float t = run + 6.2831853 * 8.0 * fi / n;                // the moments spread over eight inner orbits
        vec2 a = 0.26 * vec2(cos(t), sin(t));
        vec2 b = 0.42 * vec2(cos(ratio * t), sin(ratio * t));
        vec2 e = b - a;
        float d = length(q - a - e * clamp(dot(q - a, e) / dot(e, e), 0.0, 1.0));
        light += exp(-d * d / 0.00001);
    }
    return light;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float hk = floor(h), hm = smoothstep(0.15, 0.85, h - hk);
    float n = floor(40.0 + 40.0 * clamp(lineP, 0.0, 1.0));
    float S = 0.5 + 0.3 * clamp(cellP, 0.0, 1.0);
    float run = 0.05 * sceneTime + 0.25 * audioAdvance;
    vec2 cid = floor(p / S + 0.5);
    vec2 q = (p - cid * S) / S;
    float hc = fract(sin(dot(cid, vec2(12.9898, 78.233))) * 43758.5453);
    // ratios near the solar system's: 8/13, 3/5, 5/8, 2/3 -- each cell its own
    float rA = mod(hk + floor(hc * 4.0), 4.0), rB = mod(hk + 1.0 + floor(hc * 4.0), 4.0);
    float ratioA = rA < 0.5 ? 8.0 / 13.0 : rA < 1.5 ? 3.0 / 5.0 : rA < 2.5 ? 5.0 / 8.0 : 2.0 / 3.0;
    float ratioB = rB < 0.5 ? 8.0 / 13.0 : rB < 1.5 ? 3.0 / 5.0 : rB < 2.5 ? 5.0 / 8.0 : 2.0 / 3.0;
    float l = rose(q, ratioA, n, run + 6.2831853 * hc) * (1.0 - hm);
    if (hm > 0.002) l += rose(q, ratioB, n, run + 6.2831853 * hc) * hm;
    vec3 col = famLight(fh, 0.2 + 0.6 * hc, 0.2 * smoothstep(1.0, 3.0, l)) * l * 0.9;
    col *= 0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    // the two orbits, faintly
    float rq = length(q);
    col += famCol(fh, 0.45) * (exp(-abs(rq - 0.26) / 0.003) + exp(-abs(rq - 0.42) / 0.003)) * 0.05;
    finish(famExpose(col, 1.85, 0.70, 0.00, fh));
}
