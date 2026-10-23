//@doc
 * @brief SATURATION DEPTH SLIDE: saturated pixels lie in front and slide fast, grey ones lie behind and slide slowly, so a
 * parallax tears the photo into colour before grey.  The slide's direction wanders slowly round, the depth spread breathes.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> how far the depths spread (the parallax's reach)
 *   audioPhase      -> the slide's direction (integrated)
 *   audioSwell      -> the slide's amplitude
 *
 * Knobs: depthP (the base depth spread), biasP (which saturation counts as "in front"), hueP.
//@params depthP biasP
//@audio audioSpread audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = sceneTime * 0.4 + 2.0 * audioPhase;
    float spread = (0.4 + 0.8 * clamp(depthP, 0.0, 1.0)) * (0.6 + 0.6 * clamp(audioSpread, 0.0, 1.0));
    float A = 0.1 * spread * (0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    vec2 dir = vec2(cos(0.3 * t), sin(0.3 * t) * 0.6);
    float bias = 0.2 + 0.3 * clamp(biasP, 0.0, 1.0);
    vec2 q = uv;
    for (int i = 0; i < 3; ++i) {
        float s = satOf(imgLod(q, 2.0));
        q = uv + dir * A * (s - bias);
    }
    vec3 col = imgLod(q, 0.4);
    finish(col * 1.05);
}
