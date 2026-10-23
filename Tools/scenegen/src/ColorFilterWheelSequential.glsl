//@doc
 * @brief COLOUR FILTER WHEEL SEQUENTIAL: a projector with a colour wheel shows red, green and blue one after the other: while the photo drifts, the three channels belong to three moments, and the colours part into rainbow fringes where something moves
 * (the "rainbow effect").  Here the photo moves along a slow figure, and its three channels trail one another.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the figure the photo moves on and the delay between the channels (integrated)
 *   audioSwell   -> the delay's depth
 *
 * Knobs: sizeP (the size of the figure), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
vec2 path(float t, float A)
{
    return A * vec2(sin(0.11 * t) + 0.4 * sin(0.27 * t + 1.0), cos(0.09 * t) + 0.4 * cos(0.23 * t));
}
void main()
{
    vec2 p = screenP();
    float A = 0.18 + 0.22 * clamp(sizeP, 0.0, 1.0);
    float t = sceneTime + 0.4 * audioAdvance;
    float dl = 0.5 + 1.5 * clamp(audioSwell, 0.0, 1.0);
    vec3 col;
    for (int k = 0; k < 3; ++k) {
        vec2 o = path(t - float(k) * dl * 0.5, A);
        vec3 c = imgLod((p + o) * 0.75 + 0.5, 0.4);
        col[k] = c[k];
    }
    finish(col * 1.1);
}
