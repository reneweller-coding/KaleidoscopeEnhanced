//@doc
 * @brief COLOURED SMOKE RING COLLISIONS: smoke rings of two colours fly at each other head-on, meet, and in the meeting
 * spread outward into one wide ring that frays into a wreath of small vortex rings, the two colours mixing round it;
 * every phrase a new pair collides, at several places and sizes.  The rings travel along the line of sight's side, so
 * they are seen nearly edge-on as ellipses; after the collision the merged ring grows and its rim breaks into lobes
 * that grow into the wreath; the smoke is noise along the tube.  Two colours from the photo's colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos -> every phrase a pair of rings flies in, collides, spreads into a wreath and fades
 *   audioBass      -> the rings' size (softened by the swell)
 *   audioAdvance   -> the smoke stirs (integrated)
 *
 * Knobs: sizeP (the rings' size), frayP (how many lobes the wreath has), hueP.
//@params sizeP frayP
//@audio audioPhrasePos audioBass audioSwell
//@body
/**  One ring's smoke at a place.
 *
 * @param d     The place relative to the ring's centre. (in)
 * @param R     The ring's radius. (in)
 * @param tilt  How far the ring is turned toward the eye (0 edge-on .. 1 face-on). (in)
 * @param lobes The fraying's number of lobes. (in)
 * @param fray  How far the rim has frayed. (in)
 * @param stir  The smoke's stir. (in)
 *
 * @return
 *   x the smoke, y the angle round the ring (0..1).
 **/
vec2 ring(vec2 d, float R, float tilt, float lobes, float fray, float stir)
{
    vec2 e = d / vec2(R * (0.25 + 0.75 * tilt), R);
    float r = length(e), an = atan(e.y, e.x);
    float rim = 1.0 + 0.12 * fray * sin(lobes * an + stir);
    float tube = abs(r - rim) * R;
    float w = 0.02 + 0.03 * fray;
    float sm = exp(-pow(tube / w, 2.0)) * (0.6 + 0.4 * noise2(vec2(an * 6.0, stir) + 3.0 * r));
    sm += fray * 0.6 * exp(-pow(tube / (0.6 * w), 2.0)) * smoothstep(0.7, 1.0, sin(lobes * an + stir));
    return vec2(sm, an / 6.2831853 + 0.5);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float sw = clamp(audioSwell, 0.0, 1.0);
    float R0 = (0.18 + 0.08 * clamp(sizeP, 0.0, 1.0)) * (0.85 + 0.3 * mix(sw, clamp(audioBass, 0.0, 1.0), 0.4));
    float lobes = floor(8.0 + 6.0 * clamp(frayP, 0.0, 1.0));
    float stir = 0.2 * sceneTime + 0.8 * audioAdvance;
    vec3 cA = famLight(fh, 0.2, 0.2), cB = famLight(fh, 0.8, 0.2);
    vec3 col = famCol(fh, 0.45) * 0.02;
    for (int k = 0; k < 3; ++k) {
        float fk = float(k);
        float u = fract(audioPhrasePos + 0.33 * fk);                  // each pair's own place in the cycle
        float sc = 1.0 - 0.3 * fk;
        vec2 c = vec2(0.5 * (fk - 1.0), 0.25 * sin(1.7 * fk + 0.5));
        float R = R0 * sc;
        float life = smoothstep(0.0, 0.1, u) * (1.0 - smoothstep(0.85, 1.0, u));
        if (u < 0.5) {
            float x = (0.5 - u) * 2.0 * 0.6 * sc;                      // the two rings fly in
            vec2 a = ring(p - c + vec2(x, 0.0), R, 0.25, lobes, 0.0, stir);
            vec2 b = ring(p - c - vec2(x, 0.0), R, 0.25, lobes, 0.0, stir + 2.0);
            col += (cA * a.x + cB * b.x) * life;
        } else {
            float g = (u - 0.5) * 2.0;                                 // merged: growing and fraying
            vec2 m = ring(p - c, R * (1.0 + 1.3 * g), 0.25 + 0.5 * g, lobes, smoothstep(0.0, 0.6, g), stir);
            vec3 mixc = mix(cA, cB, 0.5 + 0.5 * sin(6.2831853 * m.y * 3.0 + stir) * smoothstep(0.0, 0.3, g));
            col += mixc * m.x * life * (2.0 - smoothstep(0.0, 0.4, g));   // (it starts as the two rings' sum)
        }
    }
    finish(famExpose(col, 5.31, 0.80, 0.03, fh));
}
