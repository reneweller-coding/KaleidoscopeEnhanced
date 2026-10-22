//@doc
 * @brief FAIRY LIGHT STRANDS: strings of small round bulbs hanging in arcs through the depth, swinging gently; the
 * near bulbs blur into large soft bokeh discs, the far ones are sharp pin-points, and lights run along the strings.
 * Each strand is a catenary between two posts, swinging about the line between them; its bulbs are spaced evenly
 * along it, each drawn as a disc whose size grows with its distance from the plane in focus (the lens' circle of
 * confusion).  The bulbs' colours are shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance   -> the strands swing (integrated)
 *   audioBeatPhase -> a running light along each strand, one bulb per beat (light only)
 *   audioSwell     -> the bulbs' glow
 *
 * Knobs: strandP (how many strands), focusP (where the focus lies), hueP.
//@params strandP focusP
//@audio audioBeatPhase audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float strands = 4.0 + 3.0 * clamp(strandP, 0.0, 1.0);
    float focus = 1.5 + 2.0 * clamp(focusP, 0.0, 1.0);
    float swing = 0.12 * sceneTime + 0.5 * audioAdvance;
    float glow = 0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = famCol(fh, 0.45) * 0.015;
    // far strands first, near ones over them
    for (int s = 6; s >= 0; --s) {
        float fs = float(s);
        if (fs >= strands) continue;
        float hs = fract(sin(fs * 12.9898) * 43758.5453);
        float z = 0.9 + 0.75 * fs;                               // the strand's depth
        float sag = (0.25 + 0.2 * hs) * z / 1.2;
        float sw = 0.35 * sin(swing * (0.7 + 0.3 * hs) + 6.0 * hs);
        for (int b = 0; b < 22; ++b) {
            float u = (float(b) + 0.5) / 22.0 * 2.0 - 1.0;          // along the strand, -1..1
            // the catenary, swung about the posts' line (its sag leans toward and away from the eye)
            float hang = sag * (cosh(1.4 * u) - cosh(1.4)) / (cosh(1.4) - 1.0);
            vec3 x = vec3(1.6 * u, (0.46 - 0.11 * fs) * z / 1.2 + hang * cos(sw), z + hang * sin(sw) * 0.8);
            vec2 sp = x.xy / x.z * 1.2 + vec2(0.25 * (hs - 0.5), 0.0);
            float coc = 0.004 + 0.05 * abs(x.z - focus) / x.z;   // the circle of confusion
            float d = length(p - sp);
            float disc = smoothstep(coc, coc * 0.8, d) * (0.004 / max(coc, 0.004));
            float core = exp(-d * d / (coc * coc * 0.08)) * 0.4;
            float run = pow(0.5 + 0.5 * cos(6.2831853 * (audioBeatPhase - float(b) / 8.0 + hs)), 8.0);
            float hb = fract(sin(fs * 7.13 + float(b) * 3.7) * 43758.5453);
            col += famLight(fh, fract(hs + 0.3 * hb), 0.4) * (disc * 2.4 + core) * (0.6 + 0.8 * run) * glow;
        }
        // the wire, faint
        float uw = clamp(p.x * z / (1.2 * 1.6), -1.0, 1.0);
        float hang = sag * (cosh(1.4 * uw) - cosh(1.4)) / (cosh(1.4) - 1.0);
        float wy = ((0.46 - 0.11 * fs) * z / 1.2 + hang * cos(sw)) / (z + hang * sin(sw) * 0.8) * 1.2;
        col += famCol(fh, 0.4) * exp(-abs(p.y - wy) / 0.002) * 0.04 * step(abs(p.x * z / (1.2 * 1.6)), 1.0);
    }
    finish(col);
}
