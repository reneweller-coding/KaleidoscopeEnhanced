//@doc
 * @brief CHIRP GRATING PHOTO: a grating whose frequency grows steadily across the picture lies in front of the photo, which appears as through
 * a zone lens: the stripes crowd toward one side, bend the picture by their own slope, and the chirp rate wanders.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the chirp rate
 *   audioAdvance    -> the chirp's centre and the stripes' run (integrated)
 *
 * Knobs: baseP (the lowest frequency), bendP (how strongly the stripes refract the picture), hueP.
//@params baseP bendP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.2 + 1.5 * audioAdvance;
    float a = 0.5 + 0.2 * sin(0.1 * t);
    vec2 dir = vec2(cos(a), sin(a));
    float d = dot(p, dir) + 0.3 * sin(0.17 * t);
    float f0 = 6.0 + 14.0 * clamp(baseP, 0.0, 1.0);
    float chirp = (14.0 + 40.0 * clamp(audioSwell, 0.0, 1.0));
    float ph = 6.2831853 * (f0 * d + 0.5 * chirp * d * d) - 0.5 * t;
    float slope = 6.2831853 * (f0 + chirp * d);
    vec2 uv = p * 0.8 + 0.5 + dir * sin(ph) * (0.01 + 0.03 * clamp(bendP, 0.0, 1.0)) * 4.0 / (1.0 + 0.05 * slope);
    vec3 col = imgLod(uv, 0.5) * (0.55 + 0.5 * cos(ph));
    finish(col);
}
