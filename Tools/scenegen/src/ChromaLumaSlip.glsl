//@doc
 * @brief CHROMA LUMA SLIP: the colour plane slides over the brightness plane on circular paths, like badly registered film: the
 * picture is seen twice, sharp in brightness and shifted in colour, and where the two paths cross the colours snap back
 * under their edges for a moment.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the radius of the colour plane's path
 *   audioPhase      -> its circling (integrated)
 *
 * Knobs: radiusP (the base radius), tiltP (how elliptic the path is), hueP.
//@params radiusP tiltP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = sceneTime * 0.4 + 3.0 * audioPhase;
    float R = (0.015 + 0.06 * clamp(radiusP, 0.0, 1.0)) * (0.5 + 1.1 * clamp(audioSwell, 0.0, 1.0));
    float e = 0.4 + 0.6 * clamp(tiltP, 0.0, 1.0);
    vec2 off = R * vec2(cos(t), e * sin(t));
    vec3 cL = imgLod(uv, 0.3);
    vec3 cC = imgLod(uv + off, 0.8);
    float Lc = max(luma(cC), 0.05);
    vec3 chroma = cC / Lc;
    vec3 col = luma(cL) * chroma;
    col = mix(col, cL, 0.12);
    finish(col * 1.1);
}
