//@doc
 * @brief TEXTURE CIRCUIT GLOW: the photograph etched into a glowing circuit --
 * its structure is traced as circuit traces running only horizontally,
 * vertically and at 45 degrees, with solder pads at the junctions and
 * little vias, on a dark green-black board; pulses of light race along the
 * traces from pad to pad, the board around the busy traces faintly
 * back-lit.  The trace layout follows the photo (each photo wires a
 * different board).  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the pulses travel (integrated, jump-free)
 *   audioSpread     -> trace density
 *   audioKick       -> pulses flare (light)
 *   audioMode       -> pulse colour: cyan in minor, amber in major
 *   audioHigh       -> the pads sparkle (light)
 *   audioSwell      -> the board's backlight (slow)
 *
 * Knobs: gridP (grid pitch), padP (pad density), boardP (board colour), hueP.
//@params gridP padP boardP
//@audio audioSpread audioKick audioMode audioHigh audioSwell
//@body
float gPitch;
// Does the edge from cell c in direction k (0 E, 1 NE, 2 N, 3 NW) carry a trace?
float edgeOn(vec2 c, int k, float dens)
{
    vec2 cuv = c / gPitch * 0.9 + 0.5;
    float busy = luma(imgLod(cuv, 3.5)) * 0.5 + length(texGrad(cuv, 4.0)) * 0.08;
    float pk = (k == 1 || k == 3) ? 0.45 : 1.0;               // fewer diagonals
    return step(hash21(c * 1.3 + float(k) * 17.0), (0.2 + 0.5 * busy + 0.3 * dens) * pk * 0.6);
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    gPitch = 12.0 + 16.0 * clamp(gridP, 0.0, 1.0);
    vec2 q = p * gPitch + vec2(0.15, 0.1) * sceneTime;
    vec2 gi = floor(q), gf = fract(q) - 0.5;
    float dens = clamp(audioSpread, 0.0, 1.0);
    // Segments from the cell centre toward its 8 neighbours; the incoming
    // ones use the neighbour's edge decision, so traces are continuous.
    vec2 dirs[4];
    dirs[0] = vec2(1.0, 0.0); dirs[1] = vec2(1.0, 1.0); dirs[2] = vec2(0.0, 1.0); dirs[3] = vec2(-1.0, 1.0);
    float dmin = 9.0; float conn = 0.0; float sAlong = 0.0;
    for (int k = 0; k < 4; ++k) {
        for (int sgn = 0; sgn < 2; ++sgn) {
            vec2 dv = dirs[k] * (sgn == 0 ? 1.0 : -1.0);
            float on = (sgn == 0) ? edgeOn(gi, k, dens) : edgeOn(gi - dirs[k], k, dens);
            if (on < 0.5) continue;
            conn += 1.0;
            vec2 b = dv * 0.5;
            float h = clamp(dot(gf, b) / dot(b, b), 0.0, 1.0);
            float d = length(gf - b * h);
            if (d < dmin) { dmin = d; sAlong = dot(gi, normalize(dirs[k])) + h * length(b) * (sgn == 0 ? 1.0 : -1.0); }
        }
    }
    float px = gPitch / resolution.y * 1.5;
    float w = 0.08;
    float trace = smoothstep(w + px, w - px, dmin);
    float pad = step(0.5, conn) * step(conn, 1.5) * smoothstep(0.2 + px, 0.2 - px, length(gf));   // pads at trace ends
    float via = step(2.5, conn) * smoothstep(0.14 + px, 0.14 - px, length(gf));                    // junctions
    float flow = 1.2 * sceneTime + 8.0 * audioAdvance;
    float pulse = pow(0.5 + 0.5 * sin(sAlong * 0.9 - flow + hash21(gi) * 0.5), 10.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    vec3 pc = mix(vec3(0.2, 0.9, 1.0), vec3(1.0, 0.7, 0.2), mode);
    pc = mix(pc, glowColour(imgLod(gi / gPitch * 0.9 + 0.5, 5.0), gi * 0.02, hueP * 0.159), 0.3);
    vec3 board = mix(vec3(0.01, 0.04, 0.025), vec3(0.03, 0.02, 0.05), clamp(boardP, 0.0, 1.0));
    board *= 0.9 + 0.2 * noise2(q * 3.0);
    vec3 copper = vec3(0.45, 0.32, 0.15);
    vec3 col = board + pc * 0.03 * (0.4 + 0.8 * swell);
    col = mix(col, copper * 0.55, max(trace, max(pad, via)));
    col += pc * trace * pulse * (1.3 + 1.5 * kick);
    col += pc * exp(-dmin * 10.0) * pulse * 0.3;
    float tw = pow(0.5 + 0.5 * sin(sceneTime * (0.8 + hash21(gi) * 1.5) + hash21(gi + 2.0) * 6.28), 6.0);
    col += vec3(1.0, 0.95, 0.8) * (pad + via) * (0.12 + 0.8 * hi) * tw;
    finish(col);
}
