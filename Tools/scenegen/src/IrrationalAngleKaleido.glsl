//@doc
 * @brief IRRATIONAL ANGLE KALEIDO: two mirrors at the angle pi over the golden ratio: their reflections never close up, and the photo covers itself in ever new fans, as many as the number of reflections allows; the fans are dense, the
 * photo seen in thousands of orientations at once.  The angle glides lightly around the irrational value with the chords of the music and the number of reflections follows the spectral spread (a deeper level fades in).
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the angle glides around pi over phi
 *   audioSpread     -> the depth of the reflections (a deeper level fading in)
 *
 * Knobs: zoomP (the zoom into the photo), hueP.
//@params zoomP
//@audio audioHarmAdvance audioSpread
//@body
/**  The photo seen through two mirrors after a number of reflections.
 *
 * @param p    The pixel. (in)
 * @param al   The angle between the mirrors. (in)
 * @param dep  The number of reflections. (in)
 *
 * @return
 *   The colour.
 **/
vec3 twoMirrors(vec2 p, float al, int dep)
{
    vec2 n2 = vec2(-sin(al), cos(al));
    for (int i = 0; i < 16; ++i) {
        if (i >= dep) break;
        p.y = abs(p.y);
        float d = dot(p, n2);
        if (d < 0.0) p -= 2.0 * d * n2;
    }
    return imgLod(rot2(0.01 * sceneTime) * p * (0.8 + 0.8 * clamp(zoomP, 0.0, 1.0)) * 0.8 + 0.5, 0.7);
}
void main()
{
    vec2 p = screenP();
    float al = 3.1415927 / 1.6180339 + 0.05 * sin(0.45 * audioHarmAdvance);
    float D = 3.0 + 9.0 * clamp(audioSpread, 0.0, 1.0);
    int d0 = int(floor(D));
    finish(mix(twoMirrors(p, al, d0), twoMirrors(p, al, d0 + 1), smoothstep(0.0, 1.0, fract(D))) * 1.05);
}
