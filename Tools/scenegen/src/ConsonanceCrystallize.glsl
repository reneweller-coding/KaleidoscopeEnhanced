//@doc
 * @brief CONSONANCE CRYSTALLIZE: a lattice of light that crystallises into clear order while the harmony is consonant
 * and melts into drifting fog when it turns dissonant: in consonance its nodes sit on a perfect hexagonal grid, joined
 * by bright bonds; as the roughness rises they wander from their places, the bonds fade and a haze rises between them.
 * The roughness is smoothed over a second or so in a small field of the scene's own and sets the order; each node's
 * wandering is slow noise scaled by the disorder, so the melting and freezing glide.  The light is shades of one colour
 * family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioRoughness -> order and disorder: consonance crystallises the lattice, dissonance melts it (smoothed)
 *   audioAdvance   -> the nodes' wandering and the fog drift (integrated)
 *   audioSwell     -> the lattice's glow
 *
 * Knobs: latticeP (the lattice's spacing), fogP (how thick the fog grows), hueP.
//@params latticeP fogP
//@audio audioRoughness audioSwell
//@state 1 1 60
//@body
/**  The state pass: the roughness smoothed over a second or so.
 *
 * @return
 *   The smoothed roughness, 0, 0, 1.
 **/
vec4 stateStep()
{
    float v = clamp(audioRoughness, 0.0, 1.0);
    float old = stateFrame < 0.5 ? v : texelFetch(texState, ivec2(0, 0), 0).r;
    return vec4(mix(old, v, 0.02), 0.0, 0.0, 1.0);
}

/**  A lattice node's place: its grid place plus a wander scaled by the disorder.
 *
 * @param cell  The node's grid place (in lattice units). (in)
 * @param dis   The disorder, 0..1. (in)
 * @param run   The wander's progress. (in)
 *
 * @return
 *   The place (in lattice units).
 **/
vec2 nodeAt(vec2 cell, float dis, float run)
{
    vec2 h = hash22(floor(cell * 2.0 + 0.5));
    return cell + dis * 0.45 * vec2(sin(run * (0.7 + h.x) + 6.2831853 * h.y), cos(run * (0.6 + h.y) + 6.2831853 * h.x));
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    float S = 0.09 + 0.05 * clamp(latticeP, 0.0, 1.0);
    float rough = texelFetch(texState, ivec2(0, 0), 0).r;
    float dis = smoothstep(0.25, 0.7, rough);
    float order = 1.0 - dis;
    float run = 0.1 * sceneTime + 0.4 * audioAdvance;
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec2 g = p / S;
    const vec2 R = vec2(1.0, 1.7320508);
    vec2 qa = mod(g, R) - 0.5 * R, qb = mod(g - 0.5 * R, R) - 0.5 * R;
    vec2 q0 = dot(qa, qa) < dot(qb, qb) ? qa : qb;
    vec2 c0 = g - q0;
    vec3 col = famCol(fh, 0.45) * 0.015;
    col += famCol(fh, 0.4) * 0.12 * dis * (0.3 + 0.7 * fbm(2.0 * p + vec2(0.1 * run, 0.0))) * (0.6 + 0.8 * clamp(fogP, 0.0, 1.0));
    for (int k = 0; k < 7; ++k) {
        float ak = 1.0471976 * float(k);
        vec2 cell = c0 + (k == 0 ? vec2(0.0) : vec2(cos(ak), sin(ak)));
        vec2 n = nodeAt(cell, dis, run);
        float dn = length(g - n) * S;
        col += famLight(fh, 0.3 + 0.4 * hash21(floor(cell * 2.0 + 0.5)), 0.5) * (exp(-pow(dn / 0.004, 2.0)) + 0.25 * exp(-dn / 0.012)) * glow;
        // three bonds from each node, so every bond is drawn once
        for (int b = 0; b < 3; ++b) {
            float ab = 1.0471976 * float(b);
            vec2 m = nodeAt(cell + vec2(cos(ab), sin(ab)), dis, run);
            vec2 e = m - n, ap = g - n;
            float d = length(ap - e * clamp(dot(ap, e) / dot(e, e), 0.0, 1.0)) * S;
            col += famLight(fh, 0.5, 0.4) * exp(-pow(d / 0.0018, 2.0)) * order * 0.5 * glow;
        }
    }
    finish(famExpose(col, 1.75, 0.70, 0.00, fh));
}
