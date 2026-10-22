//@doc
 * @brief DIPOLE FIELD LINE DANCE: the field lines of several wandering magnets drawn as glowing lines over the whole
 * picture: loops that join one magnet to the next, bundle, part and reconnect as the magnets glide about and turn.  In
 * the plane the field lines of a dipole are the level lines of its stream function (m x r) / |r|^2, and the field of
 * several is the sum; the lines are drawn at even steps of that sum, a pixel and a half wide by the sum's gradient;
 * close to a magnet, where the lines crowd, they melt into a glowing core.  The lines are shades of one colour family
 * from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the magnets glide and turn with the chords (smoothly)
 *   audioSwell       -> how dense the lines are (the loudness envelope)
 *   audioAdvance     -> the magnets drift slowly (integrated)
 *
 * Knobs: magnetP (how many magnets), lineP (the base line spacing), hueP.
//@params magnetP lineP
//@audio audioHarmAdvance audioSwell
//@body
/**  The field's stream function: the sum of the magnets' dipole stream functions.
 *
 * @param p      The place. (in)
 * @param n      The number of magnets. (in)
 * @param h      The harmony's progress. (in)
 * @param drift  The slow drift. (in)
 *
 * @return
 *   The stream function.
 **/
float stream(vec2 p, float n, float h, float drift)
{
    float s = 0.0;
    for (int i = 0; i < 5; ++i) {
        float fi = float(i);
        if (fi >= n) break;
        vec2 c = vec2(0.6 * sin(0.21 * h + drift + 2.1 * fi), 0.32 * cos(0.17 * h + 0.8 * drift + 1.3 * fi));
        float a = 0.4 * h + 1.7 * fi + 0.5 * drift;
        vec2 m = vec2(cos(a), sin(a));
        vec2 r = p - c;
        s += (m.x * r.y - m.y * r.x) / (dot(r, r) + 0.0004);
    }
    return s;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float n = floor(3.0 + 2.0 * clamp(magnetP, 0.0, 1.0));
    float h = max(audioHarmAdvance, 0.0);
    float drift = 0.01 * sceneTime + 0.04 * audioAdvance;
    float stp = (0.8 + 0.8 * clamp(lineP, 0.0, 1.0)) / (0.6 + 0.8 * clamp(audioSwell, 0.0, 1.0));
    float s = stream(p, n, h, drift);
    const float e = 0.0015;
    vec2 gr = vec2(stream(p + vec2(e, 0.0), n, h, drift) - s, stream(p + vec2(0.0, e), n, h, drift) - s) / e;
    float u = s / stp;
    float d = abs(fract(u + 0.5) - 0.5) * stp / max(length(gr), 1e-3);   // the distance to the nearest line
    float crowd = smoothstep(4.0, 1.5, stp / max(length(gr), 1e-3) * resolution.y);   // lines closer than a few pixels melt
    float line = exp(-pow(d / (1.5 / resolution.y), 2.0)) * (1.0 - crowd) + crowd * 0.35;
    float k = floor(u + 0.5);
    vec3 col = famCol(fh, 0.45) * 0.015 + famLight(fh, 0.4 + 0.2 * sin(0.7 * k), 0.4) * line;
    finish(famExpose(col, 4.29, 0.90, 0.03, fh));
}
