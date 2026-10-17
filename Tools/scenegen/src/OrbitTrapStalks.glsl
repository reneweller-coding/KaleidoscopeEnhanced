//@doc
 * @brief ORBIT TRAP STALKS: Julia sets coloured not by escape time but by orbit traps -- how close each orbit comes to
 * the two axes (Pickover's stalks) and to a ring: fine luminous stems and hairs grow from the set's spirals, and
 * where an orbit is caught in a trap it shows the photo at the point where it was caught.  The parameter c wanders
 * along the edge of the Mandelbrot set, so the stems grow, twist and rejoin.
 *
 * Audio Reactivity (structure, not only light):
 *   audioMelodyPitch -> the melody nudges c (a small, smoothed offset): the stems lean with the tune
 *   audioPhase      -> c's walk along the edge (integrated)
 *   audioSwell      -> the traps' width (thicker stems in loud passages)
 *   audioKick       -> the stems flash (light)
 *
 * Knobs: trapP (which trap leads: axes or ring), zoomP (how close in), photoP (photo share), hueP.
//@params trapP zoomP photoP
//@audio audioSwell audioKick audioMelodyPitch
//@body
void main()
{
    vec2 p = screenP();
    float zoom = 1.05 - 0.6 * clamp(zoomP, 0.0, 1.0);
    vec2 z = p * zoom * 2.0;
    // c walks along the main cardioid's edge, slightly outside it
    float a = 0.03 * sceneTime + 0.02 * audioPhase;
    vec2 e = vec2(cos(a), sin(a));
    vec2 c = 0.5 * e - 0.25 * vec2(e.x * e.x - e.y * e.y, 2.0 * e.x * e.y);
    c *= 1.02;
    c += 0.02 * (clamp(audioMelodyPitch, 0.0, 1.0) - 0.5) * vec2(0.6, 1.0);
    float w = 0.012 + 0.025 * clamp(audioSwell, 0.0, 1.0);
    float ringR = 0.6;
    float trapAxes = 1e9, trapRing = 1e9;
    vec2 catchAxes = vec2(0.0), catchRing = vec2(0.0);
    float esc = 0.0;
    for (int i = 0; i < 90; ++i) {
        z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
        float r2 = dot(z, z);
        if (r2 > 64.0) { esc = float(i) / 90.0; break; }
        float da = min(abs(z.x), abs(z.y));
        if (da < trapAxes) { trapAxes = da; catchAxes = z; }
        float dr = abs(sqrt(r2) - ringR);
        if (dr < trapRing) { trapRing = dr; catchRing = z; }
    }
    float lead = clamp(trapP, 0.0, 1.0);
    float trap = mix(trapAxes, trapRing, lead);
    vec2 caught = mix(catchAxes, catchRing, lead);
    float stalk = exp(-trap / w);
    vec3 photo = imgLod(caught * 0.35 + 0.5, 0.5);
    vec3 tone = imgPalette(atan(caught.y, caught.x) / 6.2831853 + 0.03 * audioPhase);
    vec3 glow = mix(tone * 1.4, photo * 1.5, 0.35 + 0.5 * clamp(photoP, 0.0, 1.0));
    vec3 col = glow * stalk * (0.8 + 0.6 * clamp(audioKick, 0.0, 1.0)) + imgLod(p * 0.7 + 0.5, 2.0) * 0.1 * (1.0 - stalk);
    col += tone * 0.15 * smoothstep(0.0, 0.4, esc) * (1.0 - stalk);
    finish(col);
}
