//@doc
 * @brief WATER RIPPLE PROJECTOR: the theatre's water-ripple effect: two discs of rippled glass turn against each other
 * in front of a lamp and throw a wandering net of water light over the whole wall.  Each disc focuses the lamp into
 * a net of caustic lines (where its ripples' curvature bends the light together); the two nets, turning opposite
 * ways, multiply into the familiar slowly drifting play of light on a ceiling over water.  The caustic of a ripple
 * field h is 1 / |det(I + d Hess h)|, computed from the ripples' second derivatives.  The light is shades of one
 * colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the discs turn (integrated)
 *   audioSwell   -> the ripples' depth: the net sharpens
 *
 * Knobs: rippleP (the ripples' scale), lightP (the light's brightness), hueP.
//@params rippleP lightP
//@audio audioSwell
//@body
/**  The caustic brightness of one rippled disc.
 *
 * @param p      The point on the wall (the disc's frame). (in)
 * @param scale  The ripples' scale. (in)
 * @param depth  The ripples' depth. (in)
 * @param seed   The disc's own pattern. (in)
 *
 * @return
 *   The brightness (1 is flat).
 **/
float caustic(vec2 p, float scale, float depth, float seed)
{
    mat2 hess = mat2(0.0);
    for (int i = 0; i < 4; ++i) {
        float fi = float(i) + seed;
        vec2 k = vec2(cos(2.4 * fi + seed), sin(2.4 * fi + seed)) * scale * (1.0 + 0.37 * float(i));
        float c = -cos(dot(p, k) + 1.7 * fi) * depth / (1.0 + 0.5 * float(i));
        hess += c * mat2(k.x * k.x, k.x * k.y, k.x * k.y, k.y * k.y);
    }
    mat2 J = mat2(1.0) + hess / (scale * scale);
    float det = abs(J[0][0] * J[1][1] - J[0][1] * J[1][0]);
    return min(1.0 / max(det, 0.04), 12.0);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float scale = 6.0 + 6.0 * clamp(rippleP, 0.0, 1.0);
    float depth = 0.35 + 0.35 * clamp(audioSwell, 0.0, 1.0);
    float turn = 0.04 * sceneTime + 0.18 * audioAdvance;
    float a = caustic(rot2(turn) * p, scale, depth, 0.0);
    float b = caustic(rot2(-0.8 * turn) * p + 0.3, scale * 0.8, depth, 1.3);
    float light = sqrt(a * b) * (0.5 + 0.6 * clamp(lightP, 0.0, 1.0));
    vec3 col = famLight(fh, 0.3 + 0.03 * light, 0.2 * smoothstep(2.0, 6.0, light)) * light * 0.22;
    col *= smoothstep(1.4, 0.4, length(p));                      // the lamp's beam fades toward the edges
    finish(col);
}
