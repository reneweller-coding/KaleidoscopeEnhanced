//@doc
 * @brief INFINITE MIRROR CORRIDORS ABSTRACT: two mirrors meeting at an angle that is not a whole fraction of a
 * circle -- the photo between them is reflected again and again, and the images fan out round the hinge,
 * overlapping where the angle does not close, each reflection a little dimmer and more tinted than the last.  The
 * angle between the mirrors wanders, so the fan opens, closes and its copies slide over each other.
 *
 * Audio Reactivity (structure, not only light):
 *   audioChromaHue  -> the mirrors' angle follows the key's hue (continuous)
 *   audioPhase      -> the fan turns round its hinge (integrated)
 *   audioKick       -> the mirror edges flash (light)
 *
 * Knobs: angleP (the base angle), depthP (how many reflections stay bright), hingeP (where the hinge sits), hueP.
//@params angleP depthP hingeP
//@audio audioKick
//@body
void main()
{
    vec2 p = screenP();
    vec2 hinge = vec2((clamp(hingeP, 0.0, 1.0) - 0.5) * 0.8, -0.1);
    vec2 d = p - hinge;
    float r = length(d), a = atan(d.y, d.x) - 0.03 * audioPhase - 0.01 * sceneTime;
    float wedge = 0.6 + 0.5 * clamp(angleP, 0.0, 1.0) + 0.15 * sin(audioChromaHue);
    // fold the angle into the wedge between the two mirrors, counting the reflections
    float cnt = 0.0;
    float aa = mod(a, 6.2831853);
    for (int i = 0; i < 24; ++i) {
        if (aa >= 0.0 && aa <= wedge) break;
        if (aa > wedge) aa = 2.0 * wedge - aa;                  // reflect in the second mirror
        if (aa < 0.0) aa = -aa;                                 // reflect in the first
        cnt += 1.0;
    }
    vec2 q = hinge + r * vec2(cos(aa), sin(aa));
    vec3 photo = imgLod(q * 0.75 + 0.5, 0.4 + 0.15 * cnt);
    float keep = 0.75 + 0.2 * clamp(depthP, 0.0, 1.0);
    vec3 tint = imgPalette(cnt * 0.07 + 0.03 * audioPhase);
    vec3 col = mix(photo, photo * tint * 1.8, min(cnt * 0.08, 0.6)) * pow(keep, cnt);
    float edge = exp(-pow(min(aa, wedge - aa) * r * 300.0, 2.0));
    col += mix(tint, vec3(1.0), 0.5) * edge * 0.3 * (0.4 + clamp(audioKick, 0.0, 1.0));
    finish(col);
}
