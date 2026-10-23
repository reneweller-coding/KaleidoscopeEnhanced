//@doc
 * @brief SQUARE TILED SURFACE FLOW: a surface of squares with cone points, the L-shaped table: a flow in a direction theta leads the photo past the corners and branches it, every square handing its content on to a different
 * neighbour; the photo flows along straight lines through the squares and at the corners the flow splits.  The direction theta turns steadily with the phase of the music, the number of squares follows the key.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the direction of the flow turns (integrated)
 *   audioHarmAdvance -> the size of the squares (gliding)
 *
 * Knobs: flowP (the speed of the flow), hueP.
//@params flowP
//@audio audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float th = 0.25 * audioPhase + 0.03 * sceneTime + 0.3;
    vec2 dir = vec2(cos(th), sin(th));
    float N = 4.0 + 3.0 * (0.5 + 0.5 * sin(0.45 * audioHarmAdvance));
    vec2 q = p * N + 0.5;
    float flow = (0.3 + 0.9 * clamp(flowP, 0.0, 1.0)) * (0.2 * audioAdvance + 0.3 * sceneTime);
    vec2 q0 = q - flow * dir;
    vec2 cell = floor(q0);
    vec2 loc = fract(q0);
    float s = mod(cell.x + 2.0 * cell.y, 3.0);
    vec2 off = vec2(0.31 * s, 0.23 * fract(s * 0.618));
    vec3 c = imgLod(off + loc * 0.36 + 0.2, 0.9);
    float edge = smoothstep(0.0, 0.05, min(min(loc.x, 1.0 - loc.x), min(loc.y, 1.0 - loc.y)));
    finish(c * (0.7 + 0.3 * edge) * (0.85 + 0.15 * s) * 1.1);
}
