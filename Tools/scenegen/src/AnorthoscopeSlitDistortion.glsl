//@doc
 * @brief ANORTHOSCOPE SLIT DISTORTION: Plateau's anorthoscope: a heavily distorted picture, seen through a narrow rotating slit, appears undistorted to the eye.  Here the photo is stretched into polar coordinates, and two crossed slits scan it, so the picture is
 * only there as the sum of the slits; between the slits it lies as a pale stretched ghost.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the slits turn (integrated)
 *   audioSwell   -> the width of the slits
 *
 * Knobs: sizeP (the stretch of the picture), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float r = length(p);
    float a = atan(p.y, p.x);
    float th = 0.05 * audioAdvance + 0.04 * sceneTime;
    float st = 0.7 + 0.9 * clamp(sizeP, 0.0, 1.0);
    vec2 uv = vec2(abs(a) / 3.1415927 * 0.75 + 0.125 + 0.02 * th, r * st);
    uv = vec2(uv.x * 0.7, uv.y * 0.9 + 0.1);
    vec3 c = imgLod(uv, 0.5);
    float w = 0.02 + 0.05 * clamp(audioSwell, 0.0, 1.0);
    float d1 = abs(dot(p, vec2(-sin(th), cos(th))));
    float d2 = abs(dot(p, vec2(-sin(th + 1.5708 + 0.3), cos(th + 1.5708 + 0.3))));
    float s1 = 1.0 - smoothstep(w, w * 2.2, d1);
    float s2 = 1.0 - smoothstep(w, w * 2.2, d2);
    float slits = max(s1, s2);
    vec3 ghost = imgLod(uv, 2.0) * 0.22;
    finish((c * slits * 1.4 + ghost) * 1.1);
}
