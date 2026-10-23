//@doc
 * @brief POLYGON BOKEH BLADES: the aperture blades as a shape: every bright place of the photo becomes a polygon with five to nine corners, the blades closing and opening so that the corners count glides between a pentagon and a nonagon,
 * and the corners turn with the lens.  Gathered from thirty taps in a polygon whose edge is the diaphragm; the lights count more.
 *
 * Audio Reactivity (structure, not only light):
 *   audioMode       -> the corner count (minor rounder, major more angular), over seconds
 *   audioHarmAdvance -> the turn of the blades
 *
 * Knobs: sizeP (the size of the polygon), hueP.
//@params sizeP
//@audio audioMode audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5 + 0.04 * vec2(cos(0.06 * sceneTime), sin(0.05 * sceneTime));
    float n = 5.0 + 4.0 * (0.5 + 0.5 * sin(0.11 * sceneTime + 2.0 * clamp(audioMode, 0.0, 1.0)));
    float R = 0.006 + 0.022 * clamp(sizeP, 0.0, 1.0);
    float turn = 0.3 * audioHarmAdvance + 0.05 * sceneTime;
    vec3 sum = vec3(0.0);
    float ws = 0.0;
    for (int i = 0; i < 30; ++i) {
        float a = 2.39996323 * float(i);
        float rr = sqrt((float(i) + 0.5) / 30.0);
        float sec = 6.2831853 / n;
        float rp = cos(3.1415927 / n) / cos(mod(a, sec) - 0.5 * sec);
        vec2 o = rot2(turn) * vec2(cos(a), sin(a)) * rr * rp * R;
        vec3 c = imgLod(uv + o, 0.5);
        float w = 0.2 + 5.0 * pow(luma(c), 4.0);
        sum += c * w;
        ws += w;
    }
    finish(sum / ws * 1.25);
}
