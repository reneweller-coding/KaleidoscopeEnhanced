//@doc
 * @brief SOLENOID WINDING RINGS: the Smale solenoid: a solid torus is stretched and wound twice inside itself; the cross-section shows a Cantor weave of rings into which the photo is laid.  Each ring holds two smaller ones, turned against each other by the winding, and so on six levels deep; the photo
 * fills the innermost rings, and the whole turns slowly.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the whole turns (integrated)
 *   audioHarmAdvance -> the winding between the levels glides (integrated)
 *
 * Knobs: sizeP (the size of the outer ring), hueP.
//@params sizeP
//@audio audioAdvance audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float R0 = 0.62 + 0.4 * clamp(sizeP, 0.0, 1.0);
    vec2 q = rot2(0.03 * audioAdvance + 0.02 * sceneTime) * p / R0;
    float wind = 0.8 + 0.5 * sin(0.04 * audioHarmAdvance + 0.02 * sceneTime);
    vec3 bg = imgLod(p * 0.85 + 0.5, 2.5) * 0.14;
    vec3 col = bg;
    if (length(q) < 1.0) {
        col = imgLod(q * 0.5 + 0.5, 1.0) * 0.45;
        float bits = 0.0;
        for (int n = 0; n < 6; ++n) {
            float a = wind * float(n) * 1.2 + 0.3;
            vec2 c0 = 0.52 * vec2(cos(a), sin(a));
            vec2 c1 = -c0;
            float d0 = length(q - c0);
            float d1 = length(q - c1);
            float r = 0.42;
            bool first = d0 < d1;
            float d = first ? d0 : d1;
            if (d > r) break;
            q = (q - (first ? c0 : c1)) / r;
            q = rot2(wind * 0.7) * q;
            bits = bits * 2.0 + (first ? 0.0 : 1.0);
            vec3 c = imgLod(q * 0.42 + 0.5 + 0.07 * vec2(cos(bits), sin(bits)), 0.8 + 0.2 * float(n));
            c = mix(vec3(luma(c)), c, 1.3);
            float rim = smoothstep(1.0, 0.82, length(q));
            col = mix(col, c * (0.5 + 0.12 * float(n)) * 1.3, rim);
        }
    }
    finish(col);
}
