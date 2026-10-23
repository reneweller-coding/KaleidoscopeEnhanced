//@doc
 * @brief PARALLEL COORDINATE BUNDLES: parallel coordinates: every pixel is drawn as a line through vertical axes (red, green, blue, brightness, saturation); the photo becomes a bundle of curves that winds through the arrangement of the axes.  Forty-eight places of the photo
 * wander slowly through it, so the bundle changes its shape but keeps its density where the photo has its main colours.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the axes sway against each other (integrated)
 *   audioSwell       -> the thickness of the lines
 *
 * Knobs: sizeP (the spacing of the axes), hueP.
//@params sizeP
//@audio audioSwell audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    vec3 col = imgLod(p * 0.85 + 0.5, 2.5) * 0.18;
    float sp = (0.3 + 0.2 * clamp(sizeP, 0.0, 1.0)) * asp / 2.2;
    float lw = 0.0025 + 0.004 * clamp(audioSwell, 0.0, 1.0);
    float axx[5];
    for (int a = 0; a < 5; ++a)
        axx[a] = (float(a) - 2.0) * sp * 1.55 + 0.02 * sin(0.2 * audioHarmAdvance + 1.3 * float(a));
    for (int a = 0; a < 5; ++a) {
        float d = abs(p.x - axx[a]);
        col += vec3(0.5) * (1.0 - smoothstep(0.0, 0.003, d)) * 0.35 * smoothstep(0.5, 0.4, abs(p.y));
    }
    for (int k = 0; k < 48; ++k) {
        float fk = float(k);
        vec2 h = hash22(vec2(fk, 7.3));
        vec2 pp = 0.5 + 0.4 * sin(h * 6.2831853 + 0.06 * sceneTime * (0.5 + h.yx));
        vec3 c = imgLod(pp, 2.0);
        float mx = max(c.r, max(c.g, c.b));
        float mn = min(c.r, min(c.g, c.b));
        float at[5];
        at[0] = c.r; at[1] = c.g; at[2] = c.b; at[3] = luma(c); at[4] = (mx - mn) / max(mx, 1e-3);
        vec2 q0 = vec2(axx[0], (at[0] - 0.5) * 0.8);
        float dm = 1e3;
        for (int a = 1; a < 5; ++a) {
            vec2 q1 = vec2(axx[a], (at[a] - 0.5) * 0.8);
            dm = min(dm, sdSeg(p, q0, q1));
            q0 = q1;
        }
        float al = 1.0 - smoothstep(lw * 0.5, lw * 1.5, dm);
        col += c * al * 0.55 * 1.4;
    }
    finish(col);
}
