//@doc
 * @brief TEXTURE CHROMATIC PARALLAX: the photo's three colour channels hang as three planes at three depths -- red
 * nearest, green in the middle, blue farthest -- and slide against each other: the bass moves the near plane, the
 * middle the middle one, the highs the far one, while the view sways slowly, so the picture splits into coloured
 * fringes and closes again.  Every plane is the photo's channel, shifted by the view's sway over its depth and by its
 * band (smoothed in a small field of the scene's own); the three channels are put back together and calmed toward
 * one colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBass/Mid/High -> each channel's plane slides with its band (smoothed)
 *   audioPhase         -> the view sways, the planes sliding by their depth (integrated)
 *
 * Knobs: depthP (how far apart the planes are), slideP (how far the bands move them), hueP.
//@params depthP slideP
//@audio audioBass audioMid audioHigh audioPhase
//@state 1 1 60
//@body
/**  The state pass: the three bands smoothed.
 *
 * @return
 *   The smoothed bass, middle and highs, 1.
 **/
vec4 stateStep()
{
    vec3 b = clamp(vec3(audioBass, audioMid, audioHigh), 0.0, 1.0);
    vec3 old = stateFrame < 0.5 ? b : texelFetch(texState, ivec2(0, 0), 0).rgb;
    return vec4(mix(old, b, 0.06), 1.0);
}

/**  The photo's colour calmed toward the colour family.
 *
 * @param photo  The photo's colour. (in)
 * @param fh     The family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 tone(vec3 photo, float fh)
{
    float l = luma(photo);
    return mix(photo * 1.1, famCol(fh, 0.15 + 0.7 * l) * (0.25 + 1.2 * l), 0.45);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    vec3 bands = texelFetch(texState, ivec2(0, 0), 0).rgb;
    float sway = 0.03 * sceneTime + 0.3 * audioPhase;
    vec2 eye = 0.06 * vec2(sin(sway), 0.6 * sin(0.7 * sway + 1.0));
    float gap = 0.3 + 0.5 * clamp(depthP, 0.0, 1.0);
    float slide = 0.01 + 0.03 * clamp(slideP, 0.0, 1.0);
    vec2 uv = vec2(0.5) + p * vec2(0.55, 0.95);
    vec3 c;
    for (int k = 0; k < 3; ++k) {
        float fk = float(k);
        float z = 1.0 + fk * gap;
        float b = k == 0 ? bands.x : k == 1 ? bands.y : bands.z;
        vec2 dir = vec2(cos(2.1 * fk + 0.5), sin(2.1 * fk + 0.5));
        vec2 q = uv + eye / z + dir * slide * b;
        vec3 ph = imgLod(q, 1.0);
        c[k] = ph[k];
    }
    vec3 col = mix(c, tone(c, fh), 0.35);
    finish(col);
}
