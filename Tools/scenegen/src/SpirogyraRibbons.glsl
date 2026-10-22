//@doc
 * @brief SPIROGYRA RIBBONS: clear filaments of the green alga Spirogyra lie across the dark at many depths, and inside
 * each, green chloroplast ribbons wind in spirals from cell to cell, studded with bright pyrenoids; the ribbons wind on
 * as the music moves, and their number follows the harmony.  A filament is a clear tube with thin bright walls and
 * cross walls between its cells; a ribbon wound round inside it is seen from the side as a band whose middle runs
 * along a sine of the winding, wide where the ribbon faces the eye and narrow where it turns, bright in front and
 * faint behind.  The far filaments are thinner and dimmer.  The green is pulled a little toward the photo's hue.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance     -> the ribbons wind (integrated)
 *   audioHarmAdvance -> how many ribbons wind in each filament (gliding: a new one fades in, the others make room)
 *   audioSwell       -> the ribbons' glow
 *
 * Knobs: filP (how many filaments), windP (how tightly the ribbons wind), hueP.
//@params filP windP
//@audio audioHarmAdvance audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float N = floor(6.0 + 3.0 * clamp(filP, 0.0, 1.0));
    float h = max(audioHarmAdvance, 0.0);
    float nb = 1.0 + 2.0 * (0.5 + 0.5 * sin(0.6 * h));
    float wind = 0.2 * sceneTime + 0.8 * audioAdvance;
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float gh = fract(0.33 + 0.25 * (fract(fh - 0.33 + 0.5) - 0.5));
    vec3 col = famCol(gh, 0.45) * 0.015;
    for (int i = 0; i < 9; ++i) {                                    // far to near
        float fi = float(i);
        if (fi >= N) break;
        float near = (fi + 1.0) / N;
        float hi = fract(sin(fi * 12.9898) * 43758.5453);
        float Rf = 0.02 + 0.04 * near;
        float ang = 1.2 * (hi - 0.5) + 0.05 * sin(0.02 * sceneTime + fi);
        vec2 dir = vec2(cos(ang), sin(ang));
        vec2 c = vec2(0.3 * (fract(fi * 0.618034) - 0.5), 0.9 * (fract(fi * 0.5698403 + 0.2) - 0.5));
        float s = dot(p - c, dir), t = dot(p - c, vec2(-dir.y, dir.x));
        if (abs(t) > Rf * 1.2) continue;
        float tn = t / Rf;
        float k = (8.0 + 8.0 * clamp(windP, 0.0, 1.0)) / (Rf * 20.0);
        vec3 fc = vec3(0.0);
        // the tube: thin bright walls, faint cross walls between the cells
        fc += famLight(gh, 0.5, 0.6) * exp(-pow((abs(tn) - 0.95) / 0.06, 2.0)) * 0.35;
        float cellL = 3.0 * Rf;
        fc += famLight(gh, 0.5, 0.5) * exp(-pow((fract(s / cellL + hi) - 0.5) * cellL / 0.002, 2.0)) * 0.12 * smoothstep(1.0, 0.8, abs(tn));
        for (int j = 0; j < 3; ++j) {
            float fj = float(j);
            float wj = clamp(nb - fj, 0.0, 1.0);
            if (wj <= 0.0) break;
            float ph = k * s + wind * (0.8 + 0.4 * hi) + 6.2831853 * fj / nb + 6.2831853 * hi;
            float yb = 0.75 * cos(ph), zb = sin(ph);
            float wb = 0.12 + 0.2 * abs(zb);                         // wide where the ribbon faces the eye
            float band = smoothstep(wb, wb * 0.6, abs(tn - yb));
            float front = 0.3 + 0.7 * smoothstep(-0.4, 0.6, zb);
            float pyr = exp(-(pow((fract(s / (1.5 * Rf) + fj * 0.3) - 0.5) * 1.5 * Rf / 0.004, 2.0) + pow((tn - yb) / 0.08, 2.0)));
            fc += famCol(gh, 0.4 + 0.2 * hi) * band * front * wj * 0.8 + famLight(gh, 0.6, 0.7) * pyr * front * wj * 0.6;
        }
        float alpha = smoothstep(1.2, 1.0, abs(tn)) * (0.4 + 0.5 * near);
        col = mix(col, col * 0.6 + fc * glow * (0.5 + 0.6 * near), alpha);
    }
    finish(famExpose(col, 2.15, 1.00, 0.00, fh));
}
