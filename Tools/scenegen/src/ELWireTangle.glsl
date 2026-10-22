//@doc
 * @brief EL WIRE TANGLE: a room full of electroluminescent wire, tangled in knots that loosen and tighten again while
 * the eye glides through: each wire is a closed 3D curve -- a sum of slow loops whose finer windings swell and shrink
 * with the phrase -- glowing evenly along its length, the nearer parts thicker.  The wires are sampled and projected
 * in perspective from an eye travelling through the tangle; the parts behind the eye are skipped.  The wires'
 * colours are shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos -> the tangle loosens and knots again over each phrase (the finer windings swell and shrink)
 *   audioSwell     -> the wires' glow
 *   audioAdvance   -> the glide through the tangle (integrated)
 *
 * Knobs: wireP (how many wires), knotP (how tight the knots can get), hueP.
//@params wireP knotP
//@audio audioPhrasePos audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float wires = 3.5 + 1.5 * clamp(wireP, 0.0, 1.0);
    float knot = (0.3 + 0.5 * clamp(knotP, 0.0, 1.0)) * (0.5 - 0.5 * cos(6.2831853 * audioPhrasePos));
    float glow = 0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float glide = 0.05 * sceneTime + 0.2 * audioAdvance;
    vec3 eye = vec3(0.8 * sin(glide), 0.4 * sin(0.7 * glide), 0.8 * cos(glide)) * 0.9;
    vec3 fw = normalize(-eye + 0.4 * vec3(sin(0.3 * glide), 0.0, cos(0.3 * glide)));
    vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(rt, fw);
    vec3 col = vec3(0.0);
    for (int w = 0; w < 5; ++w) {
        float fw2 = float(w);
        float on = clamp(wires - fw2, 0.0, 1.0);
        if (on <= 0.0) break;
        float best = 1e9, bestZ = 1.0;
        vec2 prev = vec2(0.0);
        bool have = false;
        for (int i = 0; i <= 150; ++i) {
            float t = 6.2831853 * float(i) / 150.0;
            vec3 x = 0.9 * vec3(sin(t + fw2) + 0.5 * sin(2.0 * t + 1.3 * fw2), cos(t + 0.7 * fw2) - 0.4 * cos(3.0 * t + fw2),
                                sin(2.0 * t + 2.1 * fw2));
            x += knot * 0.35 * vec3(sin(5.0 * t + fw2), cos(7.0 * t + 2.0 * fw2), sin(6.0 * t + 0.5 * fw2));
            vec3 v = x - eye;
            float z = dot(v, fw);
            if (z < 0.08) { have = false; continue; }
            vec2 s = vec2(dot(v, rt), dot(v, up)) / z * 0.9;
            if (have) {
                vec2 e = s - prev;
                if (dot(e, e) < 0.2) {
                    float d = length(p - prev - e * clamp(dot(p - prev, e) / max(dot(e, e), 1e-8), 0.0, 1.0));
                    if (d < best) { best = d; bestZ = z; }
                }
            }
            prev = s;
            have = true;
        }
        float wdt = 0.007 / bestZ;
        float g = exp(-pow(best / wdt, 2.0)) + 0.25 * exp(-best / (4.0 * wdt));
        col += famLight(fh, fw2 / 4.0, 0.25) * g * on * glow * 1.4;
    }
    finish(famExpose(col, 1.65, 1.00, 0.03, fh));
}
