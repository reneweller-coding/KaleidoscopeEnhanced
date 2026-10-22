//@doc
 * @brief FIBER WHIP ARCS: hundreds of glowing fibre-optic whips in a field, each tip sweeping an arc of light in the
 * long exposure; the arcs cross and overlap until they fill the screen.  A whip stands at a point of a jittered grid
 * and its tip sweeps an arc round it -- a piece of a circle between two angles that swing back and forth -- drawn as
 * a glowing band brightest at the tip.  Each pixel looks at the whips of the cells round it, since arcs reach into
 * the neighbours.  The arcs' colours are shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the whips swing (integrated: the strokes follow the music's drive, the arcs move continuously)
 *   audioSwell   -> how wide the arcs sweep
 *
 * Knobs: lengthP (the whips' length), densityP (how many whips), hueP.
//@params lengthP densityP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float S = 0.22 - 0.08 * clamp(densityP, 0.0, 1.0);
    float L = S * (1.6 + 1.0 * clamp(lengthP, 0.0, 1.0));
    float sweep = 0.6 + 1.4 * clamp(audioSwell, 0.0, 1.0);
    float ph = 0.3 * sceneTime + 1.4 * audioAdvance;
    vec2 g0 = floor(p / S);
    vec3 col = vec3(0.0);
    for (int j = -2; j <= 2; ++j)
    for (int i = -2; i <= 2; ++i) {
        vec2 c = g0 + vec2(float(i), float(j));
        float hc = fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453);
        vec2 base = (c + 0.5 + 0.6 * (vec2(fract(hc * 7.3), fract(hc * 3.1)) - 0.5)) * S;
        float R = L * (0.7 + 0.5 * fract(hc * 5.7));
        // the arc's middle angle and its half width swing; the tip is at the leading end
        float mid = 6.2831853 * hc + 0.8 * sin(ph * (0.6 + 0.6 * fract(hc * 9.1)) + 6.0 * hc);
        float half_ = 0.7 * sweep * (0.6 + 0.4 * sin(ph * 0.7 + 3.0 * hc));
        vec2 d = p - base;
        float a = atan(d.y, d.x);
        float da = mod(a - mid + 3.14159265, 6.2831853) - 3.14159265;
        float along = clamp(da / max(half_, 0.05), -1.0, 1.0);
        float inArc = smoothstep(1.0, 0.85, abs(da / max(half_, 0.05)));
        float rd = abs(length(d) - R);
        float band = (exp(-pow(rd / 0.005, 2.0)) + 0.15 * exp(-rd / 0.02)) * inArc * (0.35 + 0.65 * (0.5 + 0.5 * along));
        float tip = exp(-pow(length(d - R * vec2(cos(mid + half_), sin(mid + half_))) / 0.01, 2.0));
        col += famLight(fh, fract(hc * 2.3), 0.3) * (band + tip * 0.8);
    }
    finish(famExpose(col * 0.8, 4.00, 0.80, 0.03, fh));
}
