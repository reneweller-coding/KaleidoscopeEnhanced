//@doc
 * @brief FLIP DOT WAVE BOARD: a flip-dot display: every dot is a two-sided disc (bright and dark) that turns over; the photo stands there as the threshold of its brightness, and a slow wave of the threshold runs through the board so that
 * rows of discs turn over one after the other: the picture appears as a travelling flip front.  The discs are seen edge-on while they turn, so the front is a thin band of slivers.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the threshold glides with the harmony (integrated)
 *   audioAdvance     -> the wave runs on
 *   audioSwell       -> the depth of the wave
 *
 * Knobs: sizeP (the size of the discs), hueP.
//@params sizeP
//@audio audioSwell audioAdvance audioHarmAdvance
//@body
void main()
{
    vec2 fc = gl_FragCoord.xy;
    float Sb = 7.0 + 12.0 * clamp(sizeP, 0.0, 1.0);
    float S = Sb * resolution.y / 270.0;
    vec2 cell = floor(fc / S);
    vec2 cc = (cell + 0.5) * S;
    vec2 q = (fc - cc) / S;
    vec2 pc = (cc - 0.5 * resolution) / resolution.y;
    vec3 c = imgLod(pc * 0.8 + 0.5, 1.0 + log2(Sb / 8.0));
    float l = luma(c);
    float thr = 0.62 + 0.1 * sin(0.2 * audioHarmAdvance + 0.04 * sceneTime);
    float wc = dot(pc, vec2(cos(0.5), sin(0.5))) * 3.2 - 0.05 * audioAdvance - 0.03 * sceneTime;
    float tl = thr + (0.16 + 0.1 * clamp(audioSwell, 0.0, 1.0)) * sin(6.2831853 * wc);
    float psi = 3.1415927 * smoothstep(-0.07, 0.07, l - tl);
    float cw = cos(psi);
    float wd = max(abs(cw), 0.06);
    vec2 e = vec2(q.x / wd, q.y);
    float d = length(e) - 0.44;
    float disc = 1.0 - smoothstep(-0.04, 0.06, d);
    vec3 bright = mix(vec3(0.95), c * 1.2, 0.7);
    vec3 dark = vec3(0.05, 0.05, 0.06);
    vec3 side = cw > 0.0 ? dark : bright;
    float sliver = 1.0 - 0.5 * (1.0 - abs(cw));
    vec3 col = mix(vec3(0.02), side * sliver, disc);
    finish(col);
}
