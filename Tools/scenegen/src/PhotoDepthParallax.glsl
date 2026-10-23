//@doc
 * @brief PHOTO DEPTH PARALLAX: the second photo is a depth map for the first (bright is near): the camera circles and the first photo gains true parallax, near parts shifting more than the far, edges opening where they hide
 * what lies behind them, found by marching along the view through the height field.  The radius of the circle follows the swell, the circling the phase of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the radius of the camera's circle
 *   audioPhase      -> the camera circles (integrated)
 *
 * Knobs: depthP (the depth of the scene), hueP.
//@params depthP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float ang = 0.5 * audioPhase + 0.04 * sceneTime;
    float rad = (0.03 + 0.06 * clamp(depthP, 0.0, 1.0)) * (0.5 + 0.9 * clamp(audioSwell, 0.0, 1.0));
    vec2 dir = rad * vec2(cos(ang), sin(ang));
    float hgt = 1.0;
    vec2 q = uv;
    float lastD = 1.0;
    for (int i = 0; i < 12; ++i) {
        float lay = 1.0 - float(i) / 12.0;
        vec2 qq = uv + dir * (1.0 - lay);
        float dp = luma(imgB(qq, 1.5));
        if (dp >= lay) { q = qq; hgt = lay; break; }
        q = qq;
    }
    vec3 c = imgLod(q, 0.7);
    finish(c * (0.8 + 0.3 * hgt) * 1.05);
}
