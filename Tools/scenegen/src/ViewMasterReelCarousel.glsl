//@doc
 * @brief VIEW MASTER REEL CAROUSEL: the picture disc of a stereo viewer: seven image pairs in a ring, each made of two slightly shifted views, so the photo appears as a wreath of pairs with a little parallax that slides through an eyepiece and fuses in the beat
 * of the turn.  The wreath turns slowly, and the pair at the front is the biggest.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the wreath turns (integrated)
 *   audioSwell   -> the strength of the parallax between the two views
 *
 * Knobs: sizeP (the size of the pairs), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float rot = 0.04 * audioAdvance + 0.03 * sceneTime;
    float R0 = 0.3;
    float sz = 0.11 + 0.07 * clamp(sizeP, 0.0, 1.0);
    float par = 0.015 + 0.03 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = imgLod(p * 0.5 + 0.5, 3.5) * 0.18;
    for (int k = 0; k < 7; ++k) {
        float ak = rot + 6.2831853 * float(k) / 7.0;
        vec2 cen = R0 * vec2(cos(ak), sin(ak)) * vec2(1.55, 1.0);
        float depth = 0.5 + 0.5 * sin(ak - 1.5708);
        float s = sz * (0.75 + 0.5 * depth);
        for (int e = 0; e < 2; ++e) {
            float side = float(e) - 0.5;
            vec2 c2 = cen + vec2(side * 2.1 * s, 0.0);
            vec2 d = (p - c2) / s;
            if (abs(d.x) < 1.0 && abs(d.y) < 1.0) {
                vec2 uv = d * 0.5 * 0.55 + 0.5 + vec2(side * par * 2.0, 0.0) + 0.05 * vec2(cos(float(k) * 2.0), sin(float(k) * 2.0));
                vec3 c = imgLod(uv, 0.5);
                float vig = 1.0 - 0.45 * dot(d, d) * 0.5;
                float fr = smoothstep(0.0, 0.08, 1.0 - max(abs(d.x), abs(d.y)));
                col = mix(col, c * vig * (0.7 + 0.5 * depth), fr);
            }
        }
    }
    finish(col * 1.25);
}
