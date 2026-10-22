//@doc
 * @brief TRACTOGRAPHY FLIGHT: a flight along bundles of nerve fibres, coloured by their direction as in tractography:
 * thousands of fine glowing strands sweep past and away into the depth, bending and branching, while the branching
 * changes with the harmony.  The strands run along the flight at their own distances from it, each wandering slowly
 * round; a strand parallel to the flight looks like a line from the middle outward, so a place on the screen meets
 * each strand at the depth where its distance appears there, and only the strands of the nearest angle bins are tried.
 * A strand's colour is its bend -- two shades of the photo's colour family for its two ways, white where it runs
 * straight.  Some strands split into two after a while; which ones is drawn anew with every chord change (cross-faded).
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the branching: every chord change splits other strands (cross-faded)
 *   audioAdvance     -> the flight along the bundles (integrated)
 *   audioSwell       -> the strands' glow
 *
 * Knobs: bendP (how much the strands wander), widthP (the strands' width), hueP.
//@params bendP widthP
//@audio audioHarmAdvance audioSwell
//@body
/**  A strand's angle at a depth, and its bend.
 *
 * @param id    The strand. (in)
 * @param zw    The depth along the flight. (in)
 * @param amp   How much the strands wander. (in)
 *
 * @return
 *   x the angle, y its change with depth.
 **/
vec2 strandAt(vec2 id, float zw, float amp)
{
    vec2 h = hash22(id);
    float f1 = 0.25 + 0.2 * h.x, f2 = 0.7 + 0.4 * h.y;
    float ang = amp * (sin(f1 * zw + 6.2831853 * h.x) + 0.45 * sin(f2 * zw + 6.2831853 * h.y));
    float d = amp * (f1 * cos(f1 * zw + 6.2831853 * h.x) + 0.45 * f2 * cos(f2 * zw + 6.2831853 * h.y));
    return vec2(ang, d);
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    const float NB = 32.0, K = 4.0;
    float r = max(length(p), 1e-3), a = atan(p.y, p.x);
    float fly = 0.4 * sceneTime + 1.4 * audioAdvance;
    float amp = 0.12 + 0.18 * clamp(bendP, 0.0, 1.0);
    float wW = 0.006 + 0.008 * clamp(widthP, 0.0, 1.0);
    float h = max(audioHarmAdvance, 0.0), hk = floor(h), m = smoothstep(0.3, 0.7, fract(h));
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 cA = famLight(fh, 0.2, 0.5), cB = famLight(fh, 0.8, 0.5);
    vec3 col = famCol(fh, 0.45) * 0.02;
    float b0 = floor(a / 6.2831853 * NB + 0.5);
    for (int db = -3; db <= 3; ++db) {
        float bin = b0 + float(db);
        for (int k = 0; k < 4; ++k) {
            vec2 id = vec2(mod(bin, NB), float(k));
            float rho = 0.15 + 1.4 * fract(0.37 * float(k) + 0.618 * id.x * 0.73);
            float zv = rho / r;                                       // the depth where this strand shows here
            if (zv < 0.25 || zv > 30.0) continue;
            float base = (bin + 0.3 * (hash21(id + 7.0) - 0.5)) * 6.2831853 / NB;
            vec2 sa = strandAt(id, zv + fly, amp);
            float da = a - base - sa.x;
            float fade = smoothstep(0.25, 0.8, zv) * exp(-0.07 * zv);
            float wpx = max(wW / zv, 1.0 / resolution.y);
            float g = exp(-pow(da * r / wpx, 2.0));
            // a branch: some strands split off a second strand after a while (which ones changes with the chords)
            float split = (1.0 - m) * step(hash21(id + mod(hk, 7.0) * 3.3), 0.35) + m * step(hash21(id + mod(hk + 1.0, 7.0) * 3.3), 0.35);
            float zs = 6.0 * floor((zv + fly) / 6.0) + 6.0 * hash21(id + floor((zv + fly) / 6.0));
            float off = 0.12 * (hash21(id + 2.0) - 0.5) * smoothstep(0.0, 2.5, zv + fly - zs);
            float g2 = split * exp(-pow((da - off) * r / wpx, 2.0)) * smoothstep(0.0, 0.6, zv + fly - zs);
            vec3 tint = mix(cA, cB, 0.5 + 0.5 * tanh(sa.y * 6.0));
            tint = mix(tint, vec3(1.0) * luma(tint) * 1.2, exp(-abs(sa.y) * 12.0));   // straight ahead: white
            col += tint * (g + 0.7 * g2) * fade * glow * 0.9;
        }
    }
    col += famLight(fh, 0.5, 0.6) * exp(-r * 7.0) * 0.3;
    finish(col);
}
