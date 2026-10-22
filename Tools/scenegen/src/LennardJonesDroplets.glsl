//@doc
 * @brief LENNARD JONES DROPLETS: glowing particles that attract at a distance and repel up close gather into
 * droplets; the droplets drift, touch and merge, and as the temperature falls their insides freeze into a hexagonal
 * crystal, as it rises they melt into a jostling liquid again.  The particles sit on a hexagonal lattice -- the
 * close packing such forces make -- shaken about their places by the temperature; a particle shows only where the
 * droplets' smooth field (metaballs) says there is liquid.  The particles' light is shades of one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the temperature: loud passages melt the droplets, quiet ones crystallise them
 *   audioAdvance -> the droplets drift and the particles jostle (integrated)
 *
 * Knobs: dropP (how many droplets), grainP (the particles' size), hueP.
//@params dropP grainP
//@audio audioSwell
//@body
/**  The droplets' field: a sum of soft blobs (metaballs).
 *
 * @param x     The point. (in)
 * @param n     How many droplets. (in)
 * @param t     The drift's phase. (in)
 *
 * @return
 *   The field (above 1 inside).
 **/
float drops(vec2 x, float n, float t)
{
    float f = 0.0;
    for (int k = 0; k < 8; ++k) {
        float fk = float(k);
        if (fk >= n) break;
        vec2 c = vec2(0.75 * sin(t * (0.35 + 0.05 * fk) + 2.1 * fk), 0.4 * cos(t * (0.3 + 0.04 * fk) + 1.3 * fk));
        float R = 0.14 + 0.06 * fract(fk * 0.618);
        f += R * R / (dot(x - c, x - c) + 1e-4);
    }
    return f;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float n = floor(4.0 + 4.0 * clamp(dropP, 0.0, 1.0));
    float S = 0.022 + 0.01 * clamp(grainP, 0.0, 1.0);
    float temp = clamp(audioSwell, 0.0, 1.0);
    float t = 0.06 * sceneTime + 0.2 * audioAdvance;
    vec2 r = vec2(1.0, 1.7320508);
    vec2 g = p / S;
    vec2 a = mod(g, r) - 0.5 * r, b = mod(g - 0.5 * r, r) - 0.5 * r;
    vec2 q = dot(a, a) < dot(b, b) ? a : b;
    vec2 site = g - q;
    float hs = fract(sin(dot(site, vec2(12.9898, 78.233))) * 43758.5453);
    // the particle shaken about its place by the temperature
    vec2 jig = temp * 0.35 * vec2(sin(t * 9.0 + 6.2831853 * hs), cos(t * 8.0 + 6.2831853 * fract(hs * 7.3)));
    float d = length(q - jig) * S;
    float f = drops(site * S, n, t);
    float inside = smoothstep(0.85, 1.15, f);
    float edge = exp(-pow((f - 1.0) / 0.12, 2.0));             // the surface layer glows brighter
    float size = S * 0.32;
    float dot_ = smoothstep(size, size * 0.6, d) + 0.2 * exp(-d / (size * 2.0));
    vec3 col = famLight(fh, 0.3 + 0.4 * hs * temp, 0.3 * edge) * dot_ * (inside * 0.8 + edge * 0.6);
    col += famCol(fh, 0.45) * 0.012;
    finish(famExpose(col, 2.20, 1.00, 0.03, fh));
}
