//@doc
 * @brief CUTTLEFISH PASSING CLOUDS: the "passing cloud" of a cuttlefish: dark bands sweep in waves over a shimmering
 * skin, one after another, bending as they go, while the skin's small papillae catch an iridescent sheen between them.
 * The skin is the photo, calmed into one colour family and pebbled by a fine hexagonal grain of papillae, each tipped
 * with a little shine whose hue slides round the family's; the bands are a travelling wave along a direction that
 * turns slowly, curved by a gentle bend, their width following the harmony.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance     -> the bands sweep (integrated: with the music's drive)
 *   audioHarmAdvance -> the bands' width glides with the chords
 *   audioSwell       -> the skin's sheen
 *
 * Knobs: bandP (how dark the bands are), grainP (the papillae's size), hueP.
//@params bandP grainP
//@audio audioHarmAdvance audioSwell
//@body
/**  The photo's colour calmed toward the colour family.
 *
 * @param photo  The photo's colour. (in)
 * @param fh     The family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 tone(vec3 photo, float fh)
{
    float l = luma(photo);
    return mix(photo * 1.1, famCol(fh, 0.15 + 0.7 * l) * (0.25 + 1.2 * l), 0.45);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float width = 0.18 + 0.14 * (0.5 + 0.5 * sin(0.6 * h));
    float run = 0.25 * sceneTime + 1.0 * audioAdvance;
    float dark = 0.55 + 0.35 * clamp(bandP, 0.0, 1.0);
    float sheen = 0.5 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    // the papillae: a fine hexagonal grain, each with its own shine
    float S = 0.012 + 0.01 * clamp(grainP, 0.0, 1.0);
    vec2 g = p / S;
    const vec2 R = vec2(1.0, 1.7320508);
    vec2 qa = mod(g, R) - 0.5 * R, qb = mod(g - 0.5 * R, R) - 0.5 * R;
    vec2 q = dot(qa, qa) < dot(qb, qb) ? qa : qb;
    float hp = hash21(floor((g - q) * 2.0 + 0.5));
    float bump = sqrt(max(1.0 - dot(q, q) / 0.25, 0.0));
    vec3 skin = tone(imgLod(p * 0.5 + 0.5, 2.5), fh) * (0.6 + 0.4 * bump);
    vec3 irid = hsv2rgb(vec3(fract(fh + 0.1 * sin(6.2831853 * hp + 0.3 * run)), 0.6, 1.0));
    skin += irid * pow(bump, 6.0) * 0.18 * sheen;
    // the passing clouds: a travelling wave along a slowly turning, gently bent direction
    float ang = 0.4 * sin(0.03 * sceneTime + 0.05 * audioAdvance);
    vec2 dir = vec2(cos(ang), sin(ang));
    float u = dot(p, dir) + 0.12 * sin(2.5 * dot(p, vec2(-dir.y, dir.x)) + 0.2 * run);
    float band = smoothstep(0.25, 0.75, 0.5 + 0.5 * sin(6.2831853 * u / width - run));
    vec3 col = skin * (1.0 - dark * band);
    finish(col);
}
