//@doc
 * @brief POLAR TRUCHET ROSETTE: Truchet tiles laid in rings round a centre -- each tile two quarter arcs joining the
 * midpoints of its sides, one of two ways round -- so the arcs link into meandering loops that form a rosette; waves of
 * tiles tip from one way to the other and roll through the rings with the music, and the rings flow slowly outward
 * without end.  The tiles live in log-polar coordinates (log radius and angle, equally scaled), so every tile is square
 * and the outward flow is an exact shift; a tile's tipping cross-fades its two arc pairs.  Distinct from the Truchet
 * scenes on a square grid.  The arcs are shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the tipping waves roll through the rings and the rings flow outward (integrated)
 *   audioSwell   -> the arcs' glow
 *
 * Knobs: ringP (how many tiles round a ring), waveP (how long the tipping waves are), hueP.
//@params ringP waveP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float N = floor(14.0 + 10.0 * clamp(ringP, 0.0, 1.0));
    float wl = 0.5 + 0.8 * clamp(waveP, 0.0, 1.0);
    float run = 0.3 * sceneTime + 1.2 * audioAdvance;
    float flow = 0.02 * sceneTime + 0.08 * audioAdvance;
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float r = max(length(p), 1e-4);
    float sc = N / 6.2831853;
    vec2 u = vec2(log(r) * sc - flow * sc, atan(p.y, p.x) * sc + 0.3 * flow * sc);
    vec2 cid = floor(u);
    vec2 f = fract(u) - 0.5;
    float hc = hash21(vec2(cid.x, mod(cid.y, N)));
    // (round the ring the wave has a whole number of periods, so it closes where the angle wraps)
    float tip = smoothstep(0.3, 0.7, 0.5 + 0.5 * sin(cid.x / wl + 6.2831853 * 2.0 * cid.y / N - run + 1.5 * hc));
    float dA = min(abs(length(f + 0.5) - 0.5), abs(length(f - 0.5) - 0.5));
    float dB = min(abs(length(f - vec2(0.5, -0.5)) - 0.5), abs(length(f - vec2(-0.5, 0.5)) - 0.5));
    // the arcs a pixel and a half wide on screen: a tile is r / sc wide there
    float lw = max(0.05, 1.5 / (resolution.y * r / sc));
    float arcs = (1.0 - tip) * exp(-pow(dA / lw, 2.0)) + tip * exp(-pow(dB / lw, 2.0));
    float fade = smoothstep(0.02, 0.08, r);
    vec3 col = famCol(fh, 0.45) * 0.02 + famLight(fh, 0.3 + 0.4 * fract(cid.x * 0.13), 0.5) * arcs * glow * fade;
    col += famLight(fh, 0.5, 0.8) * exp(-r / 0.03) * 0.3;
    finish(col);
}
