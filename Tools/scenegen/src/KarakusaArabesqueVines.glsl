//@doc
 * @brief KARAKUSA ARABESQUE VINES: karakusa vines: endless spiral tendrils with leaves that fill the picture; the photo colours the leaves, and the vines grow on with the advance without ending.  Every cell has a spiral vine whose arms are shifted outwards (so it seems to grow), leaves alternate to the
 * two sides of the vine, and the vine's handedness changes from cell to cell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance     -> the vines grow on (the spiral phase) (integrated)
 *   audioHarmAdvance -> the winding changes (integrated)
 *
 * Knobs: sizeP (the size of the cells), hueP.
//@params sizeP
//@audio audioAdvance audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.28 + 0.2 * clamp(sizeP, 0.0, 1.0);
    vec2 q = p / S;
    vec2 ci = floor(q + 0.5);
    vec2 gv = (q - ci);
    float hnd = mod(ci.x + ci.y, 2.0) < 0.5 ? 1.0 : -1.0;
    float r = length(gv);
    float th = atan(gv.y, gv.x);
    float K = 3.0 + 1.0 * sin(0.05 * audioHarmAdvance + 0.02 * sceneTime);
    float s = r * K - hnd * th / 6.2831853 - hnd * (0.02 * audioAdvance + 0.03 * sceneTime);
    float v = fract(s) - 0.5;
    float tau = r * K * 4.0;
    float sd = mod(floor(tau), 2.0) < 0.5 ? 1.0 : -1.0;
    float tf = fract(tau) - 0.5;
    float vine = 1.0 - smoothstep(0.03, 0.07, abs(v));
    vec2 lv = vec2((v - sd * 0.28) / 0.26, tf / 0.4);
    float leaf = 1.0 - smoothstep(0.85, 1.0, dot(lv, lv));
    float mid = 1.0 - smoothstep(0.0, 0.06, abs(lv.x));
    float cutr = smoothstep(0.62, 0.55, r);
    vec3 c = imgLod((ci * S + gv * S) * 0.85 + 0.5, 0.8);
    vec3 lc = imgLod((ci * S + gv * S) * 0.85 + 0.5, 1.8);
    lc = mix(vec3(luma(lc)), lc, 1.5);
    vec3 base = c * 0.3;
    vec3 col = base;
    col = mix(col, lc * (0.75 + 0.45 * mid), leaf * cutr * 0.95);
    col = mix(col, vec3(0.95, 0.82, 0.45), vine * cutr * 0.9);
    finish(col * 1.15);
}
