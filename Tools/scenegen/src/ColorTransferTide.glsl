//@doc
 * @brief COLOR TRANSFER TIDE: the colour mood of one picture carried onto another by Reinhard's colour transfer -- in
 * the decorrelated l-alpha-beta space every channel is shifted and scaled to the other picture's mean and spread --
 * not all at once but on a tide: a wandering, frayed front sweeps across the frame and back, the transferred mood
 * behind it, the picture's own in front.  Two pictures are cut from the photo; both drift.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos  -> the tide sweeps across and back once a phrase (continuous)
 *   audioAdvance    -> the pictures and the front's fraying drift (integrated)
 *
 * Knobs: frontP (how frayed the front is), cutP (where the second picture is cut), photoP (how far the mood is
 * carried), hueP.
//@params frontP cutP photoP
//@audio audioPhrasePos
//@body
/**  Converts linear RGB to Reinhard's l-alpha-beta space.
 *
 * @param c  The colour. (in)
 *
 * @return
 *   l, alpha, beta.
 **/
vec3 toLab(vec3 c)
{
    vec3 lms = vec3(dot(c, vec3(0.3811, 0.5783, 0.0402)), dot(c, vec3(0.1967, 0.7244, 0.0782)), dot(c, vec3(0.0241, 0.1288, 0.8444)));
    lms = log(max(lms, 1e-3));
    return vec3((lms.x + lms.y + lms.z) * 0.5773503, (lms.x + lms.y - 2.0 * lms.z) * 0.4082483, (lms.x - lms.y) * 0.7071068);
}

/**  Converts Reinhard's l-alpha-beta back to linear RGB.
 *
 * @param l  l, alpha, beta. (in)
 *
 * @return
 *   The colour.
 **/
vec3 fromLab(vec3 l)
{
    vec3 a = vec3(l.x * 0.5773503, l.y * 0.4082483, l.z * 0.7071068);
    vec3 lms = exp(vec3(a.x + a.y + a.z, a.x + a.y - a.z, a.x - 2.0 * a.y));
    return max(vec3(dot(lms, vec3(4.4679, -3.5873, 0.1193)), dot(lms, vec3(-1.2186, 2.3809, -0.1624)),
                    dot(lms, vec3(0.0497, -0.2439, 1.2045))), 0.0);
}

void main()
{
    vec2 p = screenP();
    float prog = audioPhrasePos > 0.001 ? audioPhrasePos : fract(sceneTime / 16.0);
    vec2 drift = 0.04 * vec2(sin(0.016 * sceneTime + 0.01 * audioAdvance), cos(0.013 * sceneTime));
    float cut = clamp(cutP, 0.0, 1.0);
    mat2 RB = rot2(2.3 + 2.0 * cut);
    vec2 offB = vec2(0.3, -0.25) + 0.2 * vec2(cut, cut);
    // the two pictures' means and spreads in l-alpha-beta, from sixteen samples each
    vec3 mA = vec3(0.0), sA = vec3(0.0), mB = vec3(0.0), sB = vec3(0.0);
    for (int i = 0; i < 16; ++i) {
        vec2 g = (vec2(float(i % 4), float(i / 4)) + 0.5) / 4.0 - 0.5;
        vec3 a = toLab(imgLod(0.5 + g * 0.9 + drift, 4.0) + 0.01);
        vec3 b = toLab(imgLod(0.5 + RB * (g * 0.9 - drift) + offB, 4.0) + 0.01);
        mA += a; sA += a * a; mB += b; sB += b * b;
    }
    mA /= 16.0; mB /= 16.0;
    sA = sqrt(max(sA / 16.0 - mA * mA, 1e-4)); sB = sqrt(max(sB / 16.0 - mB * mB, 1e-4));
    vec3 c = imgLod(p * 0.5 + 0.5 + drift, 0.0);
    vec3 lab = toLab(c + 0.01);
    vec3 moved = fromLab((lab - mA) * (sB / sA) + mB) - 0.01;
    // the tide: a frayed front sweeping across and back
    float ang = 0.4 + 0.02 * sceneTime;
    float x = dot(p, vec2(cos(ang), sin(ang)));
    float fray = (0.1 + 0.4 * clamp(frontP, 0.0, 1.0)) * (fbm(p * 2.5 + vec2(0.05 * sceneTime + 0.02 * audioAdvance, 0.0)) - 0.5);
    float front = 1.9 * sin(6.2831853 * prog - 1.5707963);
    float behind = smoothstep(front + 0.15, front - 0.15, x + fray);
    vec3 col = mix(c, moved, behind * (0.6 + 0.4 * clamp(photoP, 0.0, 1.0)));
    finish(col * 1.05);
}
