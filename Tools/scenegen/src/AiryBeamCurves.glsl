//@doc
 * @brief AIRY BEAM CURVES: Airy beams -- light that bends without anything bending it: the main lobe of an Airy
 * profile accelerates sideways along a parabola as it propagates, trailed by its side lobes, and heals itself
 * behind an obstacle.  Several beams cross the frame along their curves, mirrored left and right, their lobes
 * interleaving; a dark disc drifts through them and the beams re-form behind it.  The light carries the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioMelodyPitch -> the bending: a high melody curves the beams harder (smoothed by the swell)
 *   audioAdvance    -> the light flows along the beams (integrated)
 *   audioKick       -> the main lobes flash (light)
 *
 * Knobs: beamsP (how many beams), lobeP (lobe width), photoP (photo share), hueP.
//@params beamsP lobeP photoP
//@audio audioKick audioMelodyPitch
//@body
/**  The Airy function (asymptotic forms, joined smoothly near zero).
 *
 * @param x  The argument. (in)
 *
 * @return
 *   Ai(x).
 **/
float airy(float x)
{
    if (x > 0.5) return exp(-0.6666667 * pow(x, 1.5)) / (2.0 * 1.7724539 * pow(x, 0.25));
    if (x < -0.5) { float ax = -x; return sin(0.6666667 * pow(ax, 1.5) + 0.7853982) / (1.7724539 * pow(ax, 0.25)); }
    return 0.355 - 0.259 * x;                                   // the Taylor start, between the two forms
}

void main()
{
    vec2 p = screenP();
    vec2 q = vec2(abs(p.x), p.y);                               // mirrored left and right
    int n = 2 + int(4.0 * clamp(beamsP, 0.0, 1.0));
    float bend = 1.2 + 1.6 * clamp(audioMelodyPitch, 0.0, 1.0);
    float x0 = 0.03 + 0.03 * clamp(lobeP, 0.0, 1.0);
    // a dark disc drifting through the beams (they heal behind it)
    vec2 ob = vec2(0.45 + 0.3 * sin(0.05 * sceneTime), 0.25 * sin(0.07 * sceneTime));
    float shadow = smoothstep(0.06, 0.09, length(q - ob));
    float I = 0.0, lobePh = 0.0;
    for (int i = 0; i < 6; ++i) {
        if (i >= n) break;
        float fi = float(i);
        float z = q.x;                                          // propagation runs outward from the centre
        float y0 = -0.4 + 0.8 * (fi + 0.5) / float(n);
        float dir = mod(fi, 2.0) < 0.5 ? 1.0 : -1.0;
        float s = (dir * (q.y - y0) - bend * z * z) / x0;       // the transverse coordinate in the beam's frame
        float a = airy(s) * exp(0.08 * min(s, 0.0));
        I += a * a;
        lobePh += a * (s - 0.3 * audioAdvance);
    }
    // the shadow heals: its depth fades with the distance travelled past it
    float heal = mix(shadow, 1.0, smoothstep(0.0, 0.35, q.x - ob.x));
    I *= q.x < ob.x ? 1.0 : heal;
    float lit = 1.0 - exp(-I * 9.0);
    vec2 uv = p * 0.7 + 0.5;
    vec3 photo = imgLod(uv, 0.5);
    vec3 tone = imgPalette(0.3 + 0.1 * sin(lobePh) + 0.03 * audioPhase);
    vec3 col = mix(tone * 1.3, photo * 1.5, 0.35 + 0.5 * clamp(photoP, 0.0, 1.0)) * lit + photo * 0.05;
    col += mix(tone, vec3(1.0), 0.6) * smoothstep(0.8, 1.0, lit) * 0.3 * (0.5 + clamp(audioKick, 0.0, 1.0));
    finish(col);
}
