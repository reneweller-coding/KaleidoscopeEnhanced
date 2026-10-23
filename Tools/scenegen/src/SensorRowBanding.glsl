//@doc
 * @brief SENSOR ROW BANDING: the horizontal streak noise of a sensor: every row has a small offset in brightness and colour cast, in sum a soft, wandering banding of three frequencies over the sharp photo.  The three frequencies belong to three layers of
 * rows that drift against each other; the photo slides slowly.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the three layers drift (integrated)
 *   audioSwell   -> the depth of the banding
 *
 * Knobs: sizeP (the width of the bands), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5 + 0.05 * vec2(sin(0.05 * sceneTime), cos(0.04 * sceneTime));
    vec3 c = imgLod(uv, 0.3);
    float y = gl_FragCoord.y;
    float w = 1.0 + 3.0 * clamp(sizeP, 0.0, 1.0);
    float t = 0.02 * audioAdvance + 0.15 * sceneTime;
    float b1 = sin(y * 0.09 / w + t);
    float b2 = sin(y * 0.31 / w - 1.3 * t + 1.7);
    float b3 = sin(y * 1.1 / w + 2.0 * t + 4.0);
    float amp = 0.05 + 0.1 * clamp(audioSwell, 0.0, 1.0);
    float band = amp * (0.6 * b1 + 0.4 * b2 + 0.25 * b3);
    vec3 cast = vec3(1.0 + 0.5 * band, 1.0 - 0.3 * band, 1.0 + 0.4 * sin(y * 0.2 / w + t * 0.7) * amp);
    finish(c * cast * (1.0 + band) * 1.1);
}
