//@doc
 * @brief SPIN ART PAINTING: a densely tiled field of spinning discs, the paint dripped on them flung outward in spiral
 * streaks until the streaks of neighbouring discs meet in the gaps.  On a disc spinning at angular speed w, paint
 * flung from the middle lands along a spiral; in polar coordinates its streaks are lines theta - k log r = const, each
 * streak's colour and width its own.  Each pixel belongs to the nearest disc's centre on a hexagonal lattice, so the
 * spirals of neighbours meet along the cells' borders.  Two or three colours from the photo, calmed toward one colour
 * family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioOnset   -> fresh drops: new streaks glow up near the middles
 *   audioAdvance -> the discs turn (integrated) and the streaks wind with them
 *   audioSwell   -> the streaks' twist (the spin speed)
 *
 * Knobs: discP (the discs' size), streakP (how many streaks per disc), hueP.
//@params discP streakP
//@audio audioOnset audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float S = 0.22 + 0.16 * clamp(discP, 0.0, 1.0);
    float streaks = floor(12.0 + 20.0 * clamp(streakP, 0.0, 1.0));
    float twist = 1.5 + 2.5 * clamp(audioSwell, 0.0, 1.0);
    float spin = 0.1 * sceneTime + 0.4 * audioAdvance;
    vec2 g = p / S;
    vec2 r2 = vec2(1.0, 1.7320508);
    vec2 a = mod(g, r2) - 0.5 * r2, b = mod(g - 0.5 * r2, r2) - 0.5 * r2;
    vec2 q = dot(a, a) < dot(b, b) ? a : b;
    vec2 cid = floor((g - q) * 2.0 + 0.5);
    float hc = fract(sin(dot(cid, vec2(12.9898, 78.233))) * 43758.5453);
    float r = max(length(q), 1e-3);
    float dir = hc < 0.5 ? 1.0 : -1.0;
    float th = atan(q.y, q.x) - dir * (spin * (0.7 + 0.6 * hc) + twist * log(r / 0.6));
    float u = th / 6.2831853 * streaks;
    float k = floor(u);
    float fs = fract(u);
    float hk = fract(sin(k * 7.13 + hc * 91.7) * 43758.5453);
    float width = 0.25 + 0.5 * hk;
    float streak = smoothstep(width, width * 0.6, abs(fs - 0.5) * 2.0) * smoothstep(0.02, 0.12, r);
    vec3 photo = imgLod(vec2(0.2 + 0.6 * hk, 0.25 + 0.5 * fract(hk * 3.7 + hc)), 4.5);
    float l = luma(photo);
    vec3 paint = mix(photo * 1.3, famCol(fh, 0.1 + 0.8 * fract(hk * 2.3)) * (0.5 + 0.9 * l), 0.5);
    // fresh drops: the streaks near the middle glow up on onsets
    float fresh = clamp(audioOnset, 0.0, 1.0) * exp(-r * 4.0);
    vec3 col = paint * streak * (0.7 + 0.5 * exp(-r * 1.5)) + famLight(fh, hk, 0.7) * fresh * streak * 0.6;
    // the white disc between the streaks, the gaps between discs dark
    col += famCol(fh, 0.5) * 0.06 * (1.0 - streak) * smoothstep(0.58, 0.5, r);
    finish(col);
}
