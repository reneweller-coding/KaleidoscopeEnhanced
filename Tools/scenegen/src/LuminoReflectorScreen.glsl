//@doc
 * @brief LUMINO REFLECTOR SCREEN: after Nicolas Schoeffer's Lumino: a perforated, mirroring sculpture turns in front
 * of coloured lamps, and on a translucent screen flowing shadows and reflections appear.  Each lamp throws the
 * sculpture's shadow onto the screen from its own place, so the shadows are the sculpture's pattern, scaled and
 * offset per lamp, overlapping in the lamps' colours; the mirror plates send bright streaks across.  The sculpture
 * is a turning set of plates with holes, seen through each lamp's projection.  The lamps' colours are shades of one
 * colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the lamps' colours change with the chord changes (cross-faded)
 *   audioAdvance     -> the sculpture turns (integrated)
 *   audioSwell       -> the reflections' brightness
 *
 * Knobs: plateP (how many plates), holeP (how open the plates are), hueP.
//@params plateP holeP
//@audio audioHarmAdvance audioSwell
//@body
/**  The sculpture's transmission seen from a lamp: plates turning about the centre, each with a row of holes.
 *
 * @param q       The point in the lamp's projection. (in)
 * @param plates  How many plates. (in)
 * @param open    How open the holes are. (in)
 * @param turn    The sculpture's turn. (in)
 * @param refl    Returns the plates' reflection streak. (out)
 *
 * @return
 *   How much of the lamp's light passes (0..1).
 **/
float sculpture(vec2 q, float plates, float open, float turn, out float refl)
{
    float pass = 1.0;
    refl = 0.0;
    for (int i = 0; i < 6; ++i) {
        float fi = float(i);
        if (fi >= plates) break;
        float a = turn * (0.7 + 0.2 * fi) + 1.1 * fi;
        vec2 r = rot2(a) * q;
        // a plate: a long strip seen edge-on as it turns; holes along it
        float w = 0.08 + 0.18 * abs(cos(a * 1.3 + fi));
        float onPlate = smoothstep(w, w - 0.02, abs(r.y)) * smoothstep(0.75, 0.7, abs(r.x));
        float holes = smoothstep(open, open - 0.06, length(vec2(fract(r.x * 6.0 + fi * 0.3) - 0.5, r.y / max(w, 0.05) * 0.5)));
        pass *= 1.0 - onPlate * (1.0 - holes);
        refl += onPlate * pow(abs(sin(a * 1.3 + fi)), 8.0);
    }
    return pass;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float h = max(audioHarmAdvance, 0.0);
    float hk = floor(h), hm = smoothstep(0.15, 0.85, h - hk);
    float plates = 3.0 + 3.0 * clamp(plateP, 0.0, 1.0);
    float open = 0.18 + 0.2 * clamp(holeP, 0.0, 1.0);
    float turn = 0.05 * sceneTime + 0.2 * audioAdvance;
    vec3 col = vec3(0.0);
    for (int L = 0; L < 3; ++L) {
        float fl = float(L);
        vec2 lamp = 0.35 * vec2(cos(2.0944 * fl + 0.4), sin(2.0944 * fl + 0.4));
        vec2 q = (p - lamp * 0.6) * (0.9 + 0.15 * fl);
        float refl;
        float pass = sculpture(q, plates, open, turn, refl);
        vec3 lampCol = mix(famCol(fh, fract(0.33 * (fl + hk))), famCol(fh, fract(0.33 * (fl + hk + 1.0))), hm);
        col += lampCol * pass * 0.45 * exp(-dot(p - lamp, p - lamp) * 0.8);
        col += famLight(fh, 0.5, 0.7) * refl * 0.12 * (0.5 + clamp(audioSwell, 0.0, 1.0));
    }
    // the screen: translucent, a soft falloff to its rim
    col *= smoothstep(1.3, 0.5, length(p * vec2(0.8, 1.0)));
    finish(col);
}
