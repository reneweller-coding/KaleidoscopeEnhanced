//@doc
 * @brief CUP CAUSTIC ENVELOPES: a dense field of mirror rings of many sizes, like the rim of a cup in sunlight: in each
 * a heart- or kidney-shaped curve of light -- the caustic of the light reflected inside the ring -- whose shape slides
 * from cardioid to nephroid as the light sources wander over the field.  For a ring of radius R and a source at
 * distance p from the rim point, the reflected rays focus at q along the reflected ray, with 1/p + 1/q = 2 / (R cos
 * i) (the tangential mirror equation, i the angle of incidence); the caustic is that focus traced round the rim.
 * The light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance     -> the light sources wander over the field (integrated)
 *   audioHarmAdvance -> the number of sources (one to three) follows the chord's tones (the light cross-faded)
 *   audioSwell       -> the caustics' glow
 *
 * Knobs: ringP (the rings' size), sourceP (how far away the sources stand), hueP.
//@params ringP sourceP
//@audio audioHarmAdvance audioSwell
//@body
/**  The caustic of one source in a ring: its distance to the point.
 *
 * @param q    The point (ring centre at 0, radius 1). (in)
 * @param s    The source (ring units). (in)
 *
 * @return
 *   The distance to the caustic curve.
 **/
float caustic(vec2 q, vec2 s)
{
    float best = 1e9;
    vec2 prev = vec2(0.0);
    for (int i = 0; i <= 72; ++i) {
        float th = 6.2831853 * float(i) / 72.0;
        vec2 P = vec2(cos(th), sin(th));
        vec2 inc = P - s;
        float pl = length(inc);
        inc /= max(pl, 1e-4);
        vec2 n = -P;                                             // the mirror's inward normal
        float ci = abs(dot(inc, n));
        vec2 refl = reflect(inc, n);
        float ql = 1.0 / max(2.0 / max(ci, 0.05) - 1.0 / pl, 0.05);
        vec2 C = P + refl * ql;
        if (i > 0) {
            vec2 e = C - prev;
            float h = clamp(dot(q - prev, e) / max(dot(e, e), 1e-8), 0.0, 1.0);
            if (dot(e, e) < 0.1) best = min(best, length(q - prev - e * h));
        }
        prev = C;
    }
    return best;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float S = 0.32 + 0.2 * clamp(ringP, 0.0, 1.0);
    float far = 1.0 + 3.0 * clamp(sourceP, 0.0, 1.0);
    float wander = 0.03 * sceneTime + 0.12 * audioAdvance;
    float nf = 1.0 + 2.0 * (0.5 + 0.5 * sin(0.5 * h));
    // rings on a grid, each its own size
    vec2 cid = floor(p / S + 0.5);
    vec2 c = cid * S;
    float hc = fract(sin(dot(cid, vec2(12.9898, 78.233))) * 43758.5453);
    float R = S * (0.32 + 0.14 * hc);
    vec2 q = (p - c) / R;
    vec3 col = vec3(0.0);
    for (int k = 0; k < 3; ++k) {
        float fk = float(k);
        float on = clamp(nf - fk, 0.0, 1.0);
        if (on <= 0.0) break;
        // the source somewhere over the field: its direction from this ring, at a distance
        vec2 sw = vec2(1.2 * sin(wander + 2.1 * fk), 0.7 * cos(0.8 * wander + 1.3 * fk));
        vec2 dir = normalize(sw - c + 1e-4);
        vec2 s = dir * (1.0 + far * (0.6 + 0.4 * fk));
        float d = caustic(q, s) * R;
        float g = exp(-pow(d / 0.003, 2.0)) + 0.2 * exp(-d / 0.012);
        col += famLight(fh, 0.25 + 0.3 * fk, 0.3) * g * on;
    }
    float rim = abs(length(q) - 1.0) * R;
    col += famCol(fh, 0.5) * exp(-rim / 0.003) * 0.25;
    col *= 0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    col *= step(length(q), 1.02);
    finish(col);
}
