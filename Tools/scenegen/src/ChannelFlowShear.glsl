//@doc
 * @brief CHANNEL FLOW SHEAR: every colour channel of the photo flows in another field (red along cellular vortices, green along a shear layer, blue round a dipole): the colours part only in fine fringes and run together again.  The photo is the dye in the flow: every pixel gathers the photo along its own streamline
 * (a line-integral convolution, the smear's length breathing with the swell), so the flow is seen as silk, flags and marbling of the
 * photo's own colours over the whole picture.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the smear's length: the photo runs out into the flow as the music swells
 *   audioAdvance    -> the fields' clocks (integrated); audioSwell mixes the fields
 *
 * Knobs: lengthP (the base smear length), scaleP (the flow's scale), hueP.
//@params lengthP scaleP
//@audio audioSwell audioAdvance
//@body

/**  The flow: every colour channel of the photo flows in another field (red along cellular vortices, green along a shear layer, blue round a dipole)
 *
 * @param p   The place (screen units, y -0.5..0.5). (in)
 * @param t   The flow clock. (in)
 * @param ch  The channel (unused: all colours follow the same flow). (in)
 *
 * @return
 *   The velocity.
 **/
vec2 licVel(vec2 p, float t, int ch)
{
    vec2 q = p * (1.8 + 3.0 * clamp(scaleP, 0.0, 1.0));
    if (ch == 0) return vec2(sin(2.0 * q.x + 0.3 * t) * cos(2.0 * q.y), -cos(2.0 * q.x + 0.3 * t) * sin(2.0 * q.y));
    if (ch == 1) return vec2(tanh(3.0 * q.y), 0.4 * sin(3.0 * q.x - 0.4 * t) * exp(-q.y * q.y));
    vec2 d = q - 0.3 * vec2(cos(0.2 * t), sin(0.2 * t));
    vec2 e = q + 0.3 * vec2(cos(0.2 * t), sin(0.2 * t));
    return vec2(-d.y, d.x) / (dot(d, d) + 0.05) - vec2(-e.y, e.x) / (dot(e, e) + 0.05);
}
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.3 + 3.0 * audioAdvance;
    float sw = clamp(audioSwell, 0.0, 1.0);
    float len = (0.1 + 0.32 * clamp(lengthP, 0.0, 1.0)) * (0.5 + 0.9 * sw);
    vec2 pp = p;
    vec3 cr = licSmear(p, t, len * 0.5, 0), cg = licSmear(p, t, len * 0.5, 1), cb = licSmear(p, t, len * 0.5, 2);
    vec3 col = 0.55 * vec3(cr.r, cg.g, cb.b) + 0.45 * cg;
    finish(col * 1.05);
    return;
    vec3 colS = licSmear(pp, t, len, 0);
    finish(colS * 1.05);
}
