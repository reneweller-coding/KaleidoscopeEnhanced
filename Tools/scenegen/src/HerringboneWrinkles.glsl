//@doc
 * @brief HERRINGBONE WRINKLES: a thin stiff skin on a soft base, compressed: it buckles into wrinkles -- straight
 * stripes under compression in one direction, herringbone zigzags when compressed in both, a meandering labyrinth
 * when the compression is even.  The skin is the photo; its folds are lit from a low sun, so every ridge throws a
 * highlight and every valley a shadow.  The fold field drifts and turns, the zigzag swings.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the compression (slow): loud passages fold the skin deeper and pull the stripes into
 *                      zigzags
 *   audioHarmAdvance -> each change of harmony moves the skin between stripes and labyrinth (gliding)
 *   audioPhase      -> the sun turns (integrated)
 *   audioKick       -> the ridges flash (light)
 *
 * Knobs: waveP (the wrinkle wavelength), zigP (the zigzag's amplitude), labyrinthP (the labyrinth's share), hueP.
//@params waveP zigP labyrinthP
//@audio audioSwell audioKick audioHarmAdvance
//@body
/**  The skin's height at a point: herringbone zigzags blended with a labyrinth.
 *
 * @param x  The point (screen units). (in)
 *
 * @return
 *   The height, about -1..1.
 **/
float skin(vec2 x)
{
    float ang = 0.5 * sin(0.013 * sceneTime);                  // a slow swing (no rotation on the audio)
    vec2 q = rot2(ang) * x;
    float k = 6.2831853 / (0.025 + 0.03 * clamp(waveP, 0.0, 1.0));
    float comp = clamp(audioSwell, 0.0, 1.0);
    float L = 0.22, A = (0.01 + 0.04 * clamp(zigP, 0.0, 1.0)) * (0.5 + comp);
    // the zigzag: a triangle wave with rounded corners, swinging slowly
    float tri = asin(0.97 * sin(6.2831853 * (q.y / L + 0.02 * sceneTime))) / 1.3;
    float herring = cos(k * (q.x + A * tri * 4.0) + 0.3 * sceneTime);
    float lab = cos(k * (q.x + 0.15 * fbm(q * 3.0 + 0.02 * sceneTime) - 0.1 * fbm3(q.yx * 5.0)));
    float tri2 = abs(fract(audioHarmAdvance / 6.0) * 2.0 - 1.0);
    float w = clamp(0.15 + 0.7 * clamp(labyrinthP, 0.0, 1.0) * tri2, 0.0, 1.0);
    return mix(herring, lab, smoothstep(0.3, 0.7, w)) * (0.5 + 0.7 * comp);
}

void main()
{
    vec2 p = screenP();
    float e = 0.0015;
    float h = skin(p);
    vec2 g = vec2(skin(p + vec2(e, 0.0)) - h, skin(p + vec2(0.0, e)) - h) / e;
    vec3 n = normalize(vec3(-g * 0.012, 1.0));
    float sa = 0.3 * audioPhase + 0.02 * sceneTime;
    vec3 sun = normalize(vec3(cos(sa), sin(sa), 0.55));
    float diff = max(dot(n, sun), 0.0);
    float spec = pow(max(dot(reflect(-sun, n), vec3(0.0, 0.0, 1.0)), 0.0), 18.0);
    vec2 uv = p * 0.72 + 0.5 + g * 0.0004;
    vec3 photo = imgLod(uv, 0.4);
    vec3 tone = imgPalette(0.3 + 0.1 * h + 0.03 * audioPhase);
    vec3 col = photo * (0.3 + 1.0 * diff) + mix(tone, vec3(1.0), 0.5) * spec * (0.3 + 0.6 * clamp(audioKick, 0.0, 1.0));
    finish(col);
}
