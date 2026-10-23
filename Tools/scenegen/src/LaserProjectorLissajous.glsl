//@doc
 * @brief LASER PROJECTOR LISSAJOUS: a laser projector that scans the picture with a single point on a Lissajous figure: the photo appears as a dense net of line paths whose frequency ratio glides; where the figure is denser the picture stands brighter,
 * and between the lines it is dark.  Two figures of neighbouring ratios blend into each other, so the net slowly reknits itself.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the frequency ratio steps through simple ratios with the harmony (integrated)
 *   audioAdvance     -> the phase of the figure
 *   audioSwell       -> the brightness of the lines
 *
 * Knobs: sizeP (the line width), hueP.
//@params sizeP
//@audio audioSwell audioAdvance audioHarmAdvance
//@body
float fig(vec2 p, float a, float b, float phi, float W)
{
    float acc = 0.0;
    vec2 q0 = vec2(0.82 * sin(phi), 0.0);
    for (int i = 1; i <= 140; ++i) {
        float s = 6.2831853 * float(i) / 140.0;
        vec2 q1 = vec2(0.82 * sin(a * s + phi), 0.46 * sin(b * s));
        acc += 1.0 - smoothstep(0.0, W, sdSeg(p, q0, q1));
        q0 = q1;
    }
    return acc;
}
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    vec3 c = imgLod(uv, 0.8);
    float K = 0.006 + 0.012 * clamp(sizeP, 0.0, 1.0);
    float ph = 0.07 * audioHarmAdvance + 0.01 * sceneTime;
    float n0 = floor(ph);
    float f = smoothstep(0.0, 1.0, fract(ph));
    float a0 = 3.0 + mod(n0, 3.0);
    float b0 = a0 + 1.0 + mod(floor(n0 / 3.0), 2.0);
    float a1 = 3.0 + mod(n0 + 1.0, 3.0);
    float b1 = a1 + 1.0 + mod(floor((n0 + 1.0) / 3.0), 2.0);
    float phi = 0.3 * audioAdvance + 0.05 * sceneTime;
    float d0 = fig(p, a0, b0, phi, K);
    float d1 = fig(p, a1, b1, phi, K);
    float dens = mix(d0, d1, f);
    float gain = 0.9 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = c * (0.18 + gain * dens * 0.9);
    finish(col * 1.2);
}
