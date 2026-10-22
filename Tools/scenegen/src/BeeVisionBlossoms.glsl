//@doc
 * @brief BEE VISION BLOSSOMS: blossoms as a bee sees them in ultraviolet: dark petals with glowing nectar guides --
 * radial lines leading in to a bright bull's-eye at the heart -- set in kaleidoscopic rows over the whole picture,
 * opening as the music swells, their symmetry changing with the chords.  Each blossom is a petal outline round its
 * centre (the radius swelling n times round), its guides lines in the angle fading toward the petal tips; two blossom
 * shapes of different symmetry are cross-faded as the harmony moves.  False colour in two tones from the photo: the
 * family's hue for the petals and its opposite for the guides.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the blossoms' symmetry changes with the chords (cross-faded)
 *   audioSwell       -> the blossoms open
 *   audioAdvance     -> the blossoms turn slowly (integrated)
 *
 * Knobs: sizeP (the blossoms' size), guideP (how many guide lines), hueP.
//@params sizeP guideP
//@audio audioHarmAdvance audioSwell
//@body
/**  A blossom in false colour.
 *
 * @param q      The place, the blossom's centre at 0 (in blossom radii). (in)
 * @param n      The number of petals. (in)
 * @param open   How far the petals are open. (in)
 * @param lines  Guide lines per petal. (in)
 *
 * @return
 *   x the petal, y the guides and the heart.
 **/
vec2 blossom(vec2 q, float n, float open, float lines)
{
    float r = length(q) / open, a = atan(q.y, q.x);
    float rp = 0.55 + 0.45 * pow(abs(cos(0.5 * n * a)), 0.8);
    float petal = smoothstep(rp, rp - 0.04, r);
    float guide = smoothstep(0.7, 1.0, cos(lines * n * a)) * smoothstep(0.85 * rp, 0.2, r) * petal;
    float heart = smoothstep(0.24, 0.2, r) + exp(-pow((r - 0.3) / 0.025, 2.0));
    return vec2(petal, clamp(guide + heart, 0.0, 1.0));
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float S = 0.32 + 0.12 * clamp(sizeP, 0.0, 1.0);
    float lines = 2.0 + floor(2.0 * clamp(guideP, 0.0, 1.0));
    float h = max(audioHarmAdvance, 0.0);
    float hk = floor(h), hm = smoothstep(0.15, 0.85, h - hk);
    float nA = 5.0 + mod(hk * 3.0, 4.0), nB = 5.0 + mod((hk + 1.0) * 3.0, 4.0);
    float open = 0.42 * (0.75 + 0.3 * clamp(audioSwell, 0.0, 1.0));
    float turn = 0.02 * sceneTime + 0.08 * audioAdvance;
    vec2 g = p / S;
    const vec2 R = vec2(1.0, 1.7320508);
    vec2 qa = mod(g, R) - 0.5 * R, qb = mod(g - 0.5 * R, R) - 0.5 * R;
    vec2 q = dot(qa, qa) < dot(qb, qb) ? qa : qb;
    float hb = hash21(floor((g - q) * 2.0 + 0.5));
    q = rot2(turn * (hb < 0.5 ? 1.0 : -1.0) + 6.2831853 * hb) * q;
    vec2 b = (1.0 - hm) * blossom(q, nA, open, lines) + hm * blossom(q, nB, open, lines);
    vec3 toneA = famCol(fh, 0.5), toneB = famCol(fract(fh + 0.5), 0.5);
    vec3 col = toneA * 0.03;
    col = mix(col, toneA * (0.3 + 0.15 * hb), b.x);
    col += mix(toneB, vec3(1.0), 0.25) * b.y * 0.9;
    finish(col);
}
