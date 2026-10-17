//@doc
 * @brief QUANTUM REVIVAL RING: a particle on a ring, released as a narrow packet: it spreads round the ring, breaks
 * into fractional copies -- two, three, four little packets at the rational fractions of the revival time -- and
 * at the full revival time it is one packet again, exactly (the quantum carpet of the rotor).  Drawn as concentric
 * rings, each an earlier moment, so the history spirals outward from the present; the revival time is a phrase.
 * The density lays bare the photo arranged round the ring.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos  -> the time through the revival period: whole on the phrase's one (continuous)
 *   audioPhase      -> the ring turns (integrated)
 *   audioKick       -> the packets flash (light)
 *
 * Knobs: widthP (the packet's width), historyP (how far back the outer rings reach), photoP (photo share), hueP.
//@params widthP historyP photoP
//@audio audioKick audioPhrasePos
//@body
/**  The rotor's wave function on the ring: a Gaussian packet's angular-momentum components, each turning with
 * m^2 t (so everything returns at t = 2 pi).
 *
 * @param th  The angle on the ring. (in)
 * @param t   The time, 0..2 pi for one revival. (in)
 * @param w   The packet's width. (in)
 *
 * @return
 *   The complex amplitude.
 **/
vec2 rotor(float th, float t, float w)
{
    vec2 s = vec2(0.0);
    for (int m = -14; m <= 14; ++m) {
        float fm = float(m);
        float c = exp(-0.5 * fm * fm * w * w);
        float ph = fm * th - fm * fm * t;
        s += c * vec2(cos(ph), sin(ph));
    }
    return s * w * 0.4;
}

void main()
{
    vec2 p = screenP();
    float r = length(p), th = atan(p.y, p.x) + 0.05 * audioPhase + 0.01 * sceneTime;
    float prog = audioPhrasePos > 0.001 ? audioPhrasePos : fract(sceneTime / 16.0);
    float hist = 0.15 + 0.35 * clamp(historyP, 0.0, 1.0);
    // the present at the centre, earlier moments outward (the history wraps round the period)
    float t = 6.2831853 * (prog - r * hist);
    float w = 0.15 + 0.25 * clamp(widthP, 0.0, 1.0);
    vec2 a = rotor(th, t, w);
    float I = dot(a, a);
    float lit = 1.0 - exp(-I * 2.5);
    vec2 uv = vec2(abs(mod(th, 6.2831853) - 3.14159265) / 3.14159265, r) * vec2(1.0, 0.9) + vec2(0.0, 0.05);   // mirrored: no seam
    vec3 photo = imgLod(uv, 0.5);
    vec3 tone = imgPalette(atan(a.y, a.x) / 6.2831853 + 0.03 * audioPhase);
    vec3 col = mix(tone * 1.2, photo * 1.4, 0.35 + 0.5 * clamp(photoP, 0.0, 1.0)) * lit + photo * 0.06;
    col += mix(tone, vec3(1.0), 0.6) * smoothstep(0.85, 1.0, lit) * 0.3 * (0.5 + clamp(audioKick, 0.0, 1.0));
    finish(col);
}
