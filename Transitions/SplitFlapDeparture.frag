#version 330 core
out vec4 fragColor;
/**
 * @file SplitFlapDeparture.frag
 * @brief TRANSITION SPLIT FLAP DEPARTURE: a departure board flips through to
 * the incoming scene, one cell at a time, in rows that run at their own rates.
 *
 * A split-flap does not cut between two states.  A leaf hinged across the
 * middle falls, and while it falls the top half of the cell shows the leaf's
 * back edge-on -- so the cell is briefly a squashed version of what it is
 * leaving, then a squashed version of what it is arriving at.  That squash is
 * the whole illusion: a cell that simply changed picture would be a cut, and a
 * board of cuts is not a board.
 *
 * The leaf turns at a STEADY rate.  What advances is which flap is showing, so
 * the cell passes through intermediate leaves on its way to its destination,
 * and it never snaps: nothing here is a step function of an audio envelope.
 * Rows run at slightly different rates, which is what makes a real board ripple
 * rather than settle in a block.
 *
 * Audio Reactivity:
 *   audioAdvance -> the flapping rate (continuous)
 *   audioKick    -> the board's lamps (light)
 *   audioHigh    -> the gloss on a turning leaf (light)
 *   audioMid     -> the warmth of the board's light (colour)
 *
 * Per-activation variety: colsP, flapsP, hueP.
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;
uniform float audioChromaHue;

uniform float colsP;
uniform float flapsP;
uniform float hueP;

const float PI = 3.14159265358979;

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main()
{
    float cols  = 14.0 + floor(clamp(colsP, 0.0, 1.0) * 16.0);   // rolled ONCE
    float flaps = 3.0 + floor(clamp(flapsP, 0.0, 1.0) * 5.0);    // leaves passed through
    float hue   = (hueP > 0.0) ? hueP : 0.0;

    float aspect = resolution.x / resolution.y;
    vec2  uv = gl_FragCoord.xy / resolution;

    float d   = clamp(1.0 - interpolation, 0.0, 1.0);
    float arc = sin(d * PI);

    float rows = max(3.0, floor(cols / aspect));
    vec2  grid = vec2(cols, rows);
    vec2  g = uv * grid;
    vec2  gi = floor(g);
    vec2  gf = fract(g);

    // Each cell starts a little after its row and column neighbours, so the
    // board runs through in a diagonal ripple.
    float lag = (gi.x / cols) * 0.30 + (gi.y / rows) * 0.16 + hash21(gi) * 0.14;
    float rate = 1.0 + 0.28 * (hash21(gi.yy + 3.3) - 0.5);
    // Turns at a steady rate; what advances is WHICH leaf is showing.
    float turn = max(0.0, (d - lag)) / max(1.0 - lag, 1e-3) * flaps * rate
               + audioAdvance * 0.004;
    float settled = smoothstep(flaps - 0.25, flaps + 0.15, turn);

    float leaf = floor(turn);
    float ph = fract(turn);                       // 0..1 through one leaf's fall

    // Which picture a given leaf carries: the last one is the destination, the
    // ones before it are intermediate leaves off the drum.
    // (Sampled with an offset so an intermediate leaf is a different tile.)
    vec2 cellUv = (gi + gf) / grid;

    // The leaf currently falling covers the top half, squashed by its own angle.
    float squash = abs(cos(ph * PI));
    float top = step(0.5, gf.y);

    // Contents: before it settles, an intermediate tile; after, the destination.
    float which = min(leaf, flaps);
    vec2 jump = vec2(hash21(gi + which * 7.7), hash21(gi + which * 13.1)) - 0.5;
    vec2 offUv = clamp(cellUv + jump * 0.55 * (1.0 - settled), 0.0, 1.0);

    vec3 arriving = textureLod(tex1, offUv, 0.0).rgb;
    vec3 leaving  = textureLod(tex0, cellUv, 0.0).rgb;
    // Once it has passed its first leaf the cell is showing board stock, not
    // the outgoing scene any more.
    vec3 wasHere = mix(leaving, textureLod(tex1, offUv, 0.0).rgb,
                       clamp(leaf / max(flaps, 1.0), 0.0, 1.0));
    vec3 destination = textureLod(tex1, cellUv, 0.0).rgb;
    vec3 face = mix(wasHere, destination, settled);

    // The falling leaf: in the top half of the cell it is seen edge-on, so it
    // is compressed toward the hinge and darker.
    float fall = (1.0 - settled) * top;
    vec2 squashedUv = clamp(vec2(cellUv.x,
                                 (gi.y + 0.5 + (gf.y - 0.5) * max(squash, 0.06)) / rows),
                            0.0, 1.0);
    vec3 leafFace = mix(textureLod(tex1, clamp(squashedUv + jump * 0.55 * (1.0 - settled), 0.0, 1.0), 0.0).rgb,
                        textureLod(tex0, squashedUv, 0.0).rgb, 1.0 - clamp(leaf / max(flaps, 1.0), 0.0, 1.0));
    leafFace *= 0.55 + 0.45 * squash;               // edge-on catches less light

    vec3 col = mix(face, leafFace, fall * 0.9);

    // The hinge across the middle of every cell, and the gap between cells.
    float hinge = smoothstep(0.030, 0.0, abs(gf.y - 0.5));
    col *= 1.0 - hinge * 0.55 * arc;
    float gap = smoothstep(0.045, 0.0, min(min(gf.x, 1.0 - gf.x), min(gf.y, 1.0 - gf.y)));
    col *= 1.0 - gap * 0.45 * arc;

    // The board's own lamps.
    vec3 lamp = mix(vec3(1.0, 0.94, 0.80), vec3(0.86, 0.92, 1.0), fract(hue * 0.159));
    lamp = mix(lamp, lamp * vec3(1.05, 1.0, 0.92), clamp(audioMid * 2.0, 0.0, 1.0));
    col *= 1.0 + arc * 0.10 * clamp(audioKick, 0.0, 1.0);
    col += lamp * (1.0 - settled) * (1.0 - squash) * arc
         * (0.05 + 0.20 * clamp(audioHigh * 2.0, 0.0, 1.0));

    // Nothing of the board survives the last frame.
    col = mix(col, texture(tex1, uv).rgb, smoothstep(0.93, 1.0, d));

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
