//@doc
 * @brief ORGAN PIPE FORMANT STACK: organ pipes: stopped and open, with standing waves in the tube and eddies at the lip; the picture is a field of pipes whose interior is filled with the photo as a cut through the antinodes of the wave, lined up in a pipe front.  The pipes grow in length with the
 * scale (the key), and the overtone mixture, set by the rolloff, decides how many bulges the wave in the pipe has.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the scale slides: the lengths of the pipes follow the key (integrated)
 *   audioRolloff     -> the overtone mixture: the number of bulges
 *
 * Knobs: sizeP (the number of pipes), hueP.
//@params sizeP
//@audio audioRolloff audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float N = 12.0 + 12.0 * clamp(sizeP, 0.0, 1.0);
    float xn = p.x / asp * 0.96 + 0.5;
    float i = floor(xn * N);
    float fx = fract(xn * N);
    float tilt = 0.5 + 0.5 * sin(0.05 * audioHarmAdvance + 0.02 * sceneTime);
    float L = 0.3 + 0.62 * pow(1.0 - i / N, 0.6 + 0.7 * tilt);
    float y0 = -0.5;
    float y = p.y - y0;
    float u = clamp(y / L, 0.0, 1.0);
    float k = 1.0 + 3.0 * clamp(audioRolloff, 0.0, 1.0);
    float bulge = 0.5 + 0.5 * cos(3.1415927 * k * u * 2.0 + 0.4 * sceneTime);
    float inside = step(0.0, y) * step(y, L) * smoothstep(0.0, 0.07, fx) * (1.0 - smoothstep(0.93, 1.0, fx));
    float mouth = smoothstep(0.0, 0.03, y) * (1.0 - smoothstep(0.1, 0.13, y));
    vec3 c = imgLod(vec2(p.x * 0.85 / asp + 0.5, p.y * 0.85 + 0.5), 0.8);
    vec3 pipe = c * (0.35 + 0.8 * bulge) * (0.8 + 0.3 * sin(3.1415927 * fx));
    pipe += vec3(0.4, 0.35, 0.25) * mouth * 0.4;
    vec3 wood = imgLod(p * 0.85 + 0.5, 2.5) * 0.14 + vec3(0.03, 0.02, 0.015);
    finish(mix(wood, pipe * 1.2, inside));
}
