//@doc
 * @brief CORONA BEAD WIRES: a dark room strung with taut wires at every angle and depth, and along them beads of corona
 * glow run, steadily and softly, in time with the music; the more it swells, the more beads light.  A wire is a
 * straight segment in space, seen in perspective; along it the beads sit at even steps that slide with the music's
 * drive, each bead keeping its number as it runs, so it lights or darkens by its own threshold without jumping.  The
 * wires are faint, the beads soft round glows.  The light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the beads run along the wires (integrated: with the music's tempo and drive)
 *   audioSwell   -> how many beads glow (each fades in and out by its own threshold)
 *
 * Knobs: wireP (how many wires), beadP (the beads' spacing), hueP.
//@params wireP beadP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float N = floor(10.0 + 6.0 * clamp(wireP, 0.0, 1.0));
    float spacing = 0.12 + 0.1 * clamp(beadP, 0.0, 1.0);
    float run = 0.3 * sceneTime + 1.2 * audioAdvance;
    float dens = 0.3 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = famCol(fh, 0.45) * 0.015;
    for (int i = 0; i < 16; ++i) {
        float fi = float(i);
        if (fi >= N) break;
        float h1 = fract(sin(fi * 12.9898) * 43758.5453), h2 = fract(sin(fi * 78.233) * 43758.5453);
        float h3 = fract(sin(fi * 37.719) * 43758.5453);
        vec3 a = vec3(2.4 * (h1 - 0.5), 1.4 * (h2 - 0.5), 1.2 + 2.5 * h3);
        vec3 b = a + 3.0 * normalize(vec3(sin(6.2831853 * h2), 0.5 * cos(6.2831853 * h3), 0.6 * sin(6.2831853 * h1)));
        if (a.z < 0.4 || b.z < 0.4) b.z = max(b.z, 0.4);
        vec2 sa = a.xy / a.z, sb = b.xy / b.z;
        vec2 ab = sb - sa, ap = p - sa;
        float s = clamp(dot(ap, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0);
        float perp = length(ap - ab * s);
        float z = mix(a.z, b.z, s);
        float wire = exp(-pow(perp / 0.0016, 2.0)) * 0.3 / (0.5 + 0.25 * z);
        float u = s * length(b - a) / spacing - run * (0.6 + 0.6 * h1);
        float j = floor(u + 0.5);
        float hb = fract(sin(j * 12.9898 + fi * 7.31) * 43758.5453);
        float on = smoothstep(hb - 0.05, hb + 0.05, dens);
        float along = (u - j) * spacing / length(b - a) * length(ab);   // the distance along the wire on screen
        float w = 0.014 / z;
        float bead = exp(-(along * along + perp * perp) / (w * w)) * on;
        col += famLight(fh, 0.3 + 0.4 * h2, 0.5) * (wire + bead * 2.0 / (0.4 + 0.3 * z));
    }
    finish(col);
}
