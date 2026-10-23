//@doc
 * @brief PULSE COMPRESSION CHIRP FAN: the pulse compression of radar: a linear chirp is convolved with its mirror image, and a long wave becomes a narrow peak; the photo lies in strips that begin as chirps and end as spikes.  Each strip is a plot of its own signal, in the colour of the photo
 * where it passes, and its compression runs through the strips as a slow wave, so the picture alternates between long waves and sharp peaks.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the compression wave runs through the strips (integrated)
 *   audioSwell   -> the length of the chirps (and the height of the peaks)
 *
 * Knobs: sizeP (the number of strips), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 q = gl_FragCoord.xy / resolution;
    float rows = 8.0 + 8.0 * clamp(sizeP, 0.0, 1.0);
    float row = floor(q.y * rows);
    float fy = fract(q.y * rows);
    float ph = 0.02 * audioAdvance + 0.025 * sceneTime - row * 0.045;
    float c = 0.5 - 0.5 * cos(6.2831853 * ph);
    float x0 = 0.5 + 0.3 * sin(0.7 * row + 0.1 * sceneTime) + 0.0;
    float dx = q.x - x0;
    float kch = 900.0 + 1400.0 * clamp(audioSwell, 0.0, 1.0);
    float envW = mix(0.35, 0.05, c);
    float env = exp(-dx * dx / (envW * envW));
    float chirp = cos(kch * dx * dx) * env;
    float peak = exp(-dx * dx / 0.0008) * 1.1;
    float s = mix(chirp, peak, smoothstep(0.55, 1.0, c));
    float yv = 0.5 + 0.38 * s * (0.5 + 0.5 * mix(1.0, 1.6, c));
    float d = abs(fy - yv);
    float line = 1.0 - smoothstep(0.02, 0.06, d);
    vec3 ph3 = imgLod(vec2(q.x * 0.85 + 0.075, (row + fy) / rows * 0.85 + 0.075), 1.5);
    ph3 = mix(vec3(luma(ph3)), ph3, 1.5);
    vec3 base = imgLod(vec2(q.x, q.y) * 0.85 + 0.075, 2.5) * 0.14;
    float gl = exp(-d * d / 0.004) * 0.35;
    vec3 col = base + ph3 * (line + gl) * 1.4;
    float edge = smoothstep(0.0, 0.04, fy) * (1.0 - smoothstep(0.96, 1.0, fy));
    finish(col * (0.6 + 0.4 * edge));
}
