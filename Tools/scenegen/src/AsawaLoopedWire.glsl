//@doc
 * @brief ASAWA LOOPED WIRE: after Ruth Asawa: hanging forms of looped wire -- lobes swelling and narrowing one below
 * the other, smaller lobes nested inside the larger ones -- drawn as lines of light, a row of them hanging side by
 * side and on through the depth, turning slowly.  Each form is a surface of revolution whose profile is a chain of
 * lobes; its wire mesh shows as its outline, the rings at each lobe's waist (flattened ellipses) and meridian lines
 * running down it that slide round as it turns.  The light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the number of lobes glides with the chord changes (the light of two counts cross-faded)
 *   audioAdvance     -> the forms turn (integrated)
 *   audioSwell       -> the inner forms swell
 *
 * Knobs: formP (how many forms in a row), meshP (how many meridian lines), hueP.
//@params formP meshP
//@audio audioHarmAdvance audioSwell
//@body
/**  A form's light at a point of its frame.
 *
 * @param q      The point (form's axis at x = 0, top at y = 0.5, bottom at -0.5). (in)
 * @param lobes  The lobe count. (in)
 * @param turn   The form's turn. (in)
 * @param mer    The meridian lines. (in)
 * @param inner  The inner form's swell. (in)
 *
 * @return
 *   The light (0..~1).
 **/
float form(vec2 q, float lobes, float turn, float mer, float inner)
{
    float y = clamp(q.y, -0.5, 0.5);
    float u = (0.5 - y) * lobes;                                 // which lobe, from the top
    float r = 0.16 * pow(abs(sin(3.14159265 * u)), 0.7) + 0.012;
    float light = 0.0;
    for (int s = 0; s < 2; ++s) {
        float rr = s == 0 ? r : r * (0.45 + 0.15 * inner);
        // the outline
        light += exp(-pow((abs(q.x) - rr) / 0.0025, 2.0));
        // the meridian lines: x = rr cos(phi), visible on the front (sin(phi) > 0)
        for (int m = 0; m < 10; ++m) {
            if (float(m) >= mer) break;
            float phi = turn * (s == 0 ? 1.0 : -1.3) + 6.2831853 * float(m) / mer;
            float front = smoothstep(-0.2, 0.3, sin(phi));
            light += exp(-pow((q.x - rr * cos(phi)) / 0.002, 2.0)) * (0.25 + 0.5 * front) * 0.6;
        }
    }
    // the waist rings between lobes: flattened ellipses
    float wy = 0.5 - (floor(u + 0.5)) / lobes;
    vec2 e = vec2(q.x / max(r * 2.5, 0.03), (q.y - wy) / 0.012);
    light += exp(-pow((length(e) - 1.0) / 0.15, 2.0)) * 0.4 * step(abs(q.y), 0.5);
    return light * step(abs(q.y), 0.52);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float lf = 3.0 + 2.0 * (0.5 + 0.5 * sin(0.6 * h));
    float lk = floor(lf), lm = smoothstep(0.2, 0.8, lf - lk);
    float mer = floor(5.0 + 5.0 * clamp(meshP, 0.0, 1.0));
    float turn = 0.08 * sceneTime + 0.35 * audioAdvance;
    float inner = clamp(audioSwell, 0.0, 1.0);
    float W = 0.5 - 0.2 * clamp(formP, 0.0, 1.0);
    vec3 col = vec3(0.0);
    // two rows in depth: the far row smaller and dimmer, offset by half a form
    for (int row = 1; row >= 0; --row) {
        float fr = float(row);
        float sc = 1.0 + 0.6 * fr;
        vec2 q = p * sc + vec2(0.5 * W * fr, 0.08 * fr);
        float k = floor(q.x / W + 0.5);
        vec2 f = vec2(q.x - k * W, q.y) / (W * 2.0);
        float hk = fract(sin(k * 12.9898 + fr * 7.0) * 43758.5453);
        f.y += 0.05 * sin(0.3 * sceneTime + 6.0 * hk);           // each hangs a little higher or lower
        float lightA = form(f, lk, turn + 6.0 * hk, mer, inner), lightB = form(f, lk + 1.0, turn + 6.0 * hk, mer, inner);
        float l = mix(lightA, lightB, lm);
        col += famLight(fh, 0.2 + 0.5 * hk, 0.2) * l * (1.0 - 0.45 * fr) * 0.7;
    }
    finish(famExpose(col, 5.13, 0.80, 0.00, fh));
}
