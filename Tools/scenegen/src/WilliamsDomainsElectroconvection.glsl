//@doc
 * @brief WILLIAMS DOMAINS: electroconvection in a nematic liquid crystal -- rolls aligned by the director, an
 * anisotropic Swift-Hohenberg pattern.  The director turns slowly, so the rolls must follow: they buckle into
 * zigzags, split into domains of two tilts and heal again.  Seen as through crossed polarisers: the rolls'
 * birefringence paints interference colours over the photo, banded like an oil film.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBass       -> the voltage (the control parameter): deeper rolls, sharper colours
 *   audioHarmAdvance -> each change of harmony turns the director a little further (the rolls reorient)
 *   audioPhase      -> the polarisers turn (integrated): the colours shift
 *   audioKick       -> the roll crests flash (light)
 *
 * Knobs: aniP (how strongly the director orders the rolls), tiltP (the base turning speed), filmP (the colour
 * order: thin film or thick), hueP.
//@params aniP tiltP filmP
//@audio audioBass audioKick audioHarmAdvance
//@state 320 180 900
//@body
/**  The directional operator D = d_nn + eta d_tt of one channel of the field at a cell (cells 0.75 apart).
 *
 * @param ip   The cell. (in)
 * @param ch   The channel: 0 the pattern u, 1 the last step's D u. (in)
 * @param n    The director (unit). (in)
 * @param eta  The weight across the director. (in)
 *
 * @return
 *   D of the channel.
 **/
float dirOp(ivec2 ip, int ch, vec2 n, float eta)
{
    float h2 = 0.5625;
    float c = stAt(ip)[ch];
    float uxx = (stAt(ip + ivec2(1, 0))[ch] + stAt(ip - ivec2(1, 0))[ch] - 2.0 * c) / h2;
    float uyy = (stAt(ip + ivec2(0, 1))[ch] + stAt(ip - ivec2(0, 1))[ch] - 2.0 * c) / h2;
    float uxy = (stAt(ip + ivec2(1, 1))[ch] - stAt(ip + ivec2(-1, 1))[ch] - stAt(ip + ivec2(1, -1))[ch]
                 + stAt(ip - ivec2(1, 1))[ch]) / (4.0 * h2);
    float dnn = n.x * n.x * uxx + 2.0 * n.x * n.y * uxy + n.y * n.y * uyy;
    return dnn + eta * (uxx + uyy - dnn);
}

/**  One explicit step of an anisotropic Swift-Hohenberg equation for this cell (the state pass):
 * u_t = r u - (1 + D)^2 u - u^3 with D = d_nn + eta d_tt along the director n.  D u is kept in the second channel,
 * so D^2 u is D of the last step's D u (one step behind, which the small step allows).
 *
 * @return
 *   u, D u, 0, 1.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    if (stateFrame < 0.5) return vec4(0.2 * (stRand(0) - 0.5), 0.0, 0.0, 1.0);
    float dt = 0.008;                                          // a margin for the lagged D^2 u
    float ang = (0.02 + 0.05 * clamp(tiltP, 0.0, 1.0)) * sceneTime + 0.35 * audioHarmAdvance;
    vec2 n = vec2(cos(ang), sin(ang));
    float eta = 1.0 - 0.8 * clamp(aniP, 0.0, 1.0);
    float u = stAt(ip).r;
    float Du = dirOp(ip, 0, n, eta);
    float DDu = dirOp(ip, 1, n, eta);
    float voltage = 0.05 + 0.4 * clamp(audioBass, 0.0, 1.0);   // the control parameter
    float du = voltage * u - (u + 2.0 * Du + DDu) - u * u * u;
    return vec4(clamp(u + dt * du, -2.0, 2.0), Du, 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    vec2 cc = stView(p, 0.5);
    float u = stLin(cc).r;
    // crossed polarisers: the rolls' retardation as interference colours (a thin-film palette), over the photo
    float order = 0.6 + 1.6 * clamp(filmP, 0.0, 1.0);
    float ret = order * (1.0 + 1.5 * u) + 0.05 * audioPhase;
    vec3 film = 0.5 + 0.5 * cos(6.2831853 * (ret * vec3(1.0, 1.15, 1.32) + vec3(0.0, 0.1, 0.2)));
    vec2 uv = p * 0.7 + 0.5 + 0.004 * sceneTime * vec2(1.0, 0.3);
    vec3 photo = imgLod(uv, 0.5);
    vec3 tone = imgPalette(0.4 + 0.03 * audioPhase);
    vec3 col = mix(photo * 0.5, photo * film * 2.0, 0.8) * (0.6 + 0.5 * abs(u));
    col += mix(tone, vec3(1.0), 0.5) * smoothstep(0.5, 1.0, u) * (0.15 + 0.4 * clamp(audioKick, 0.0, 1.0));
    finish(col);
}
