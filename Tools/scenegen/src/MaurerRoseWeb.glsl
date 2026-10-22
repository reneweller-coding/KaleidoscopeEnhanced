//@doc
 * @brief MAURER ROSE WEB: Maurer roses drawn so large that their webs of straight lines fill the picture: points on a
 * rose curve r = sin(n theta), taken at every step of a fixed angle and joined in order, so the lines leap across the
 * rose and weave a lace of stars and petals; two roses lie over each other; as the step angle glides the whole web
 * rearranges, and n changes with the chords.  Each rose is 200 straight segments; where lines cross the light adds
 * up.  The web is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance     -> the step angle glides (integrated): the web rearranges continuously
 *   audioHarmAdvance -> the roses' n glides from one value to the next with the chords
 *   audioSwell       -> the lines' glow
 *
 * Knobs: sizeP (the roses' size), lineP (the lines' width), hueP.
//@params sizeP lineP
//@audio audioHarmAdvance audioSwell
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

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float R = 0.9 + 0.3 * clamp(sizeP, 0.0, 1.0);
    float lw = 0.0012 + 0.0012 * clamp(lineP, 0.0, 1.0);
    float h = max(audioHarmAdvance, 0.0);
    float hk = floor(h), hm = smoothstep(0.15, 0.85, h - hk);
    float n = mix(2.0 + mod(hk * 3.0, 5.0), 2.0 + mod((hk + 1.0) * 3.0, 5.0), hm);
    float run = 0.01 * sceneTime + 0.04 * audioAdvance;
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = famCol(fh, 0.45) * 0.015;
    for (int r = 0; r < 2; ++r) {
        float fr = float(r);
        float stepA = radians(71.0 + 17.0 * fr + 6.0 * sin(run + 1.3 * fr));   // the step angle, gliding
        vec2 c = vec2(0.25 * (fr - 0.5), 0.0);
        float rot = 0.3 * fr + 0.2 * run;
        float acc = 0.0;
        vec2 prev = c;
        for (int k = 0; k <= 200; ++k) {
            float th = float(k) * stepA;
            vec2 pt = c + R * (0.9 - 0.25 * fr) * sin(n * th) * vec2(cos(th + rot), sin(th + rot));
            if (k > 0) acc += exp(-pow(segD(p, prev, pt) / lw, 2.0));
            prev = pt;
        }
        col += famLight(fh, 0.35 + 0.3 * fr, 0.4) * acc * glow * 0.35;
    }
    finish(col);
}
