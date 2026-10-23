//@doc
 * @brief TINTINNABULI BELL DRONE: the tintinnabuli style: a melody in steps and a triad as accompaniment; in the picture stairs of photo strips run through calm circles whose centres are the notes of the triad.  The strips' direction steps along a staircase (smoothed), and three large rings
 * ripple like bells, in time with the slow stepping of the melody.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the stair of directions climbs (integrated)
 *   audioSwell       -> the bells' ring amplitude
 *
 * Knobs: sizeP (the width of the strips), hueP.
//@params sizeP
//@audio audioSwell audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float u = 0.08 * audioHarmAdvance + 0.02 * sceneTime;
    float th = 0.35 * (floor(u) + smoothstep(0.25, 0.75, fract(u)));
    vec2 n = vec2(cos(th), sin(th));
    float sw = 10.0 + 14.0 * (1.0 - clamp(sizeP, 0.0, 1.0));
    float s = dot(p, n) * sw + 0.2 * sceneTime;
    float stripe = smoothstep(0.1, 0.4, 0.5 + 0.5 * sin(6.2831853 * s));
    vec3 c = imgLod(p * 0.85 + 0.5 + 0.03 * floor(s) * vec2(sin(th), cos(th)) * 0.3, 0.6);
    vec3 col = c * (0.3 + 0.7 * stripe);
    float bell = 0.0;
    for (int k = 0; k < 3; ++k) {
        float ak = th * 0.5 + 2.0943951 * float(k) + 0.03 * sceneTime;
        vec2 cen = 0.28 * vec2(cos(ak), sin(ak)) * vec2(1.4, 1.0);
        float rr = length(p - cen);
        float rings = 0.5 + 0.5 * cos(6.2831853 * (rr * 5.0 - 0.1 * sceneTime - 0.2 * float(k)));
        float disc = 1.0 - smoothstep(0.21, 0.23, rr);
        float outer = exp(-rr * 5.0) * 0.5;
        bell += disc * (0.3 + 0.3 * rings * (0.5 + clamp(audioSwell, 0.0, 1.0))) + outer * rings * 0.4;
        col = mix(col, imgLod(p * 0.85 + 0.5, 0.5) * (1.1 + 0.25 * rings), disc * 0.96);
    }
    finish(col + bell * vec3(0.18, 0.17, 0.14));
}
