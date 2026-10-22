//@doc
 * @brief PAINT COLLISION SLOW MO: jets of paint from three directions meet in slow motion: they swell into one glossy
 * mass, a crown of fingers rises round it, filaments stretch out and droplets fly off -- every phrase a new collision,
 * slower as the music swells -- in two or three colours of the photo.  The paint is a metaball field: the jets are
 * capsules sliding in, the crown a ring of balls on a growing ring, the droplets small balls flying outward; the
 * surface is lit from its field's gradient with a glossy highlight, and its colour is each part's colour weighted by
 * its share of the field.  Everything fades before the phrase ends, so the next collision starts clean.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos -> every phrase a new collision: the jets meet, the crown rises, the drops fly, all fades
 *   audioSwell     -> the slow motion: the collision unfolds more slowly as the music swells
 *   audioAdvance   -> the collisions' directions turn from one to the next (integrated)
 *
 * Knobs: splashP (how far the crown spreads), dropP (how many droplets), hueP.
//@params splashP dropP
//@audio audioPhrasePos audioSwell
//@body
/**  The distance from a point to a segment.
 *
 * @param p  The point. (in)
 * @param a  The segment's start. (in)
 * @param b  The segment's end. (in)
 *
 * @return
 *   The distance.
 **/
float segD(vec2 p, vec2 a, vec2 b)
{
    vec2 ab = b - a, ap = p - a;
    return length(ap - ab * clamp(dot(ap, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0));
}

/**  The paint's field and its colour-weighted share at a place.
 *
 * @param p      The place. (in)
 * @param g      The collision's progress, 0..1. (in)
 * @param turn   The collision's direction. (in)
 * @param splash How far the crown spreads. (in)
 * @param ND     The number of droplets. (in)
 * @param fh     The colour family's hue. (in)
 *
 * @return
 *   xyz the colour sum (weighted), w the field.
 **/
vec4 paint(vec2 p, float g, float turn, float splash, float ND, float fh)
{
    vec4 acc = vec4(0.0);
    float meet = smoothstep(0.0, 0.22, g);                            // the jets are in the picture from the start
    for (int i = 0; i < 3; ++i) {
        float a = turn + 2.0943951 * float(i);
        vec2 dir = vec2(cos(a), sin(a));
        vec2 tip = dir * mix(0.5, 0.04, meet);
        float d = segD(p, tip, tip + dir * 1.2);
        float r = 0.1 * (1.0 - 0.6 * smoothstep(0.35, 0.8, g));
        float f = r * r / (d * d + 1e-4);
        acc += vec4(famLight(fract(fh + 0.12 * (float(i) - 1.0)), 0.5, 0.1) * f, f);
    }
    float after = smoothstep(0.3, 0.9, g);
    float rc = (0.1 + 0.35 * splash) * after;
    for (int k = 0; k < 12; ++k) {
        float fk = float(k);
        float a = turn + 6.2831853 * fk / 12.0;
        vec2 c = rc * vec2(cos(a), sin(a));
        float r = 0.035 * after;
        float d = length(p - c);
        float f = r * r / (d * d + 1e-4);
        acc += vec4(famLight(fract(fh + 0.12 * (mod(fk, 3.0) - 1.0)), 0.5, 0.1) * f, f);
    }
    float fly = smoothstep(0.45, 1.0, g);
    for (int k = 0; k < 16; ++k) {
        float fk = float(k);
        if (fk >= ND) break;
        float hk = fract(sin(fk * 12.9898) * 43758.5453);
        float a = turn + 6.2831853 * (fk + 0.5 * hk) / ND;
        vec2 c = (rc + 0.5 * fly * (0.5 + hk)) * vec2(cos(a), sin(a));
        float r = 0.018 * fly * (0.6 + 0.6 * hk);
        float d = length(p - c);
        float f = r * r / (d * d + 1e-4);
        acc += vec4(famLight(fract(fh + 0.12 * (mod(fk, 3.0) - 1.0)), 0.5, 0.1) * f, f);
    }
    return acc;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float splash = clamp(splashP, 0.0, 1.0);
    float ND = floor(8.0 + 8.0 * clamp(dropP, 0.0, 1.0));
    float pos = clamp(audioPhrasePos, 0.0, 1.0);
    float g = pow(pos, 1.0 + 0.6 * clamp(audioSwell, 0.0, 1.0));      // the slow motion
    float turn = 0.05 * sceneTime + 0.2 * audioAdvance;
    float life = smoothstep(0.0, 0.05, pos) * (1.0 - smoothstep(0.88, 1.0, pos));
    vec4 a = paint(p, g, turn, splash, ND, fh);
    const float e = 0.002;
    float fx = paint(p + vec2(e, 0.0), g, turn, splash, ND, fh).w, fy = paint(p + vec2(0.0, e), g, turn, splash, ND, fh).w;
    vec2 gr = vec2(fx - a.w, fy - a.w) / e;
    float inside = smoothstep(0.9, 1.1, a.w);
    vec3 n = normalize(vec3(-gr * 0.02, 1.0));
    vec3 base = a.xyz / max(a.w, 1e-4);
    float dif = 0.4 + 0.6 * max(dot(n, normalize(vec3(-0.4, 0.6, 0.7))), 0.0);
    float spec = pow(max(dot(n, normalize(vec3(-0.4, 0.6, 1.7))), 0.0), 40.0);
    vec3 col = famCol(fh, 0.45) * 0.02;
    col = mix(col, base * dif + vec3(1.0) * spec * 0.6, inside * life);
    finish(famExpose(col, 3.65, 0.80, 0.05, fh));
}
