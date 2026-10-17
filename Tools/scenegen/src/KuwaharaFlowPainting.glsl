//@doc
 * @brief KUWAHARA FLOW PAINTING: the photo repainted by an anisotropic Kuwahara filter -- round every point eight
 * sectors of an ellipse laid along the picture's own lines, the calmest sector's average taken as the paint -- so the
 * photo turns into a flowing painting whose strokes follow its edges.  The brush swells and shrinks, the strokes'
 * direction field turns slowly, and the picture drifts beneath, so the painting is painted anew all the time.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the brush's size
 *   audioPhase      -> the strokes' direction turns (integrated)
 *   audioAdvance    -> the photo drifts (integrated)
 *
 * Knobs: brushP (the base brush), stretchP (how long the strokes are), photoP (how much of the plain photo shows
 * through), hueP.
//@params brushP stretchP photoP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = 0.5 + p * (0.5 + 0.04 * sin(0.02 * sceneTime)) + 0.06 * vec2(sin(0.017 * sceneTime + 0.01 * audioAdvance), cos(0.013 * sceneTime));
    // the strokes' direction: along the photo's lines, the whole field turned slowly
    vec2 g = texGrad(uv, 3.0);
    float gl = length(g);
    float ang = atan(g.y, g.x) + 1.5707963 + 0.02 * audioPhase;
    float aniso = clamp(gl * 0.25, 0.0, 0.85) * (0.4 + 0.6 * clamp(stretchP, 0.0, 1.0));
    float r = (0.011 + 0.012 * clamp(brushP, 0.0, 1.0)) * (0.7 + 0.9 * clamp(audioSwell, 0.0, 1.0));
    mat2 R = rot2(ang);
    vec2 ax = vec2(r * (1.0 + aniso), r * (1.0 - aniso * 0.7));
    vec3 num = vec3(0.0);
    float den = 0.0;
    for (int s = 0; s < 8; ++s) {
        vec3 m = vec3(0.0), m2 = vec3(0.0);
        for (int k = 0; k < 6; ++k) {
            float a = 0.7853982 * (float(s) + (float(k % 3) + 0.5) / 3.0);
            float rr = k < 3 ? 0.45 : 1.0;
            vec2 o = R * (ax * rr * vec2(cos(a), sin(a)));
            vec3 c = imgLod(uv + o, 1.2);
            m += c;
            m2 += c * c;
        }
        m /= 6.0;
        vec3 v = m2 / 6.0 - m * m;
        float var = v.r + v.g + v.b;
        float w = 1.0 / (1.0 + pow(var * 300.0, 4.0));          // the calm sectors win
        num += m * w;
        den += w;
    }
    vec3 col = num / max(den, 1e-6);
    col = mix(col, imgLod(uv, 0.0), 0.2 * clamp(photoP, 0.0, 1.0));
    finish(col * 1.05);
}
