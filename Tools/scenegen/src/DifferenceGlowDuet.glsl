//@doc
 * @brief DIFFERENCE GLOW DUET: where the two photos differ the picture glows: out of the difference of their brightness soft zones grow in which both photos shine through, each in its own colour, and where they agree the picture
 * lies dim.  The zones' edges are sharp when the spectral spread is wide and soft when it is narrow; the zones drift a little as the photos are shifted against each other with the drive of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> the sharpness of the zones
 *   audioAdvance    -> the photos slide against each other (integrated)
 *
 * Knobs: glowP (how bright the zones glow), hueP.
//@params glowP
//@audio audioSpread
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    vec2 off = 0.04 * vec2(sin(0.03 * audioAdvance), cos(0.027 * audioAdvance));
    vec3 a = imgLod(uv + off, 0.7), b = imgB(uv - off, 0.7);
    float d = abs(luma(imgLod(uv + off, 2.5)) - luma(imgB(uv - off, 2.5)));
    float sh = 0.12 + 0.3 * (1.0 - clamp(audioSpread, 0.0, 1.0));
    float w = smoothstep(0.08, 0.08 + sh, d);
    vec3 both = 0.5 * (a + b);
    finish(both * (0.3 + (0.9 + 0.9 * clamp(glowP, 0.0, 1.0)) * w) + 0.15 * w * max(a, b));
}
