#version 330 core
out vec4 fragColor;
/**
 * @file HilbertCurveSweep.frag
 * @brief TRANSITION HILBERT CURVE SWEEP: a space-filling curve walks the frame
 * and drags the boundary between the two scenes along with it, so the wipe edge
 * is fractal instead of a line.
 *
 * The Hilbert index is computed, not approximated: for every cell the shader
 * walks down the orders, reads the quadrant bit by bit and rotates the frame
 * the way the construction does, which is what gives the curve its one useful
 * property -- cells that are close along the curve are close on screen.  That
 * is why the wipe stays local and compact instead of scattering: the boundary
 * is one connected front that folds through itself.
 *
 * A plain diagonal or radial wipe covers area in a shape you can predict from
 * the first frame.  This one cannot be predicted and still never jumps: the
 * index is monotonic along the curve, so the covered set only ever grows.
 *
 * Audio Reactivity:
 *   audioAdvance  -> a slow drift of the front (continuous)
 *   audioCentroid -> the curve's order, i.e. how fine the folding is (slow)
 *   audioHigh     -> the light on the advancing front (light)
 *   audioKick     -> the front's brightness (light)
 *
 * Per-activation variety: orderP, edgeP, hueP.
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

uniform float orderP;
uniform float edgeP;
uniform float hueP;

const float PI = 3.14159265358979;

// The distance along the Hilbert curve of the cell (x, y) in an n x n grid.
// Walks down the orders: read the quadrant, add the quadrant's share of the
// curve, then rotate the frame the way the construction does.
uint hilbertIndex(uint n, uint x, uint y)
{
    uint rx, ry, dd = 0u;
    for (uint s = n / 2u; s > 0u; s /= 2u)
    {
        rx = ((x & s) > 0u) ? 1u : 0u;
        ry = ((y & s) > 0u) ? 1u : 0u;
        dd += s * s * ((3u * rx) ^ ry);
        if (ry == 0u)
        {
            if (rx == 1u) { x = n - 1u - x; y = n - 1u - y; }
            uint t = x; x = y; y = t;
        }
    }
    return dd;
}

void main()
{
    float ord  = clamp(orderP, 0.0, 1.0);
    float edgeW = (edgeP > 0.0) ? edgeP : 1.0;
    float hue  = (hueP  > 0.0) ? hueP  : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution;

    float d   = clamp(1.0 - interpolation, 0.0, 1.0);
    float arc = sin(d * PI);

    // Order 4..6, i.e. a 16, 32 or 64 cell grid.  Chosen ONCE per activation --
    // changing it mid-turn would renumber every cell at once.
    uint order = uint(4.0 + floor(ord * 2.99));
    uint n = 1u << order;
    float fn = float(n);

    vec2 g = clamp(uv, 0.0, 0.9999) * fn;
    uvec2 cell = uvec2(g);
    vec2 f = fract(g);

    uint idx = hilbertIndex(n, cell.x, cell.y);
    float total = fn * fn;

    // Within a cell, the curve runs through it, so the front should cross a
    // cell smoothly rather than flipping it whole.  The diagonal of the cell is
    // a good enough stand-in for the curve's own path through it.
    float sub = clamp((f.x + f.y) * 0.5, 0.0, 1.0);
    float pos = (float(idx) + sub) / total;

    // The front, with a soft edge a couple of cells wide.
    float w = (1.6 * edgeW) / total * fn;          // in units of the whole curve
    float front = d * (1.0 + 2.0 * w) - w + audioAdvance * 0.0004;
    float taken = smoothstep(front + w, front - w, pos);

    vec3 col = mix(texture(tex0, uv).rgb, texture(tex1, uv).rgb, taken);

    // The advancing front carries a little light.
    float band = exp(-pow((pos - front) / max(w, 1e-4), 2.0)) * arc;
    vec3 glow = mix(vec3(0.85, 0.92, 1.0), vec3(1.0, 0.92, 0.82), fract(hue * 0.159));
    col += glow * band * (0.10 + 0.30 * clamp(audioHigh * 2.0, 0.0, 1.0)
                               + 0.16 * clamp(audioKick, 0.0, 1.0));
    // And the cell grid shows faintly while the curve is working.
    float grid = smoothstep(0.035, 0.0, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    col *= 1.0 - grid * 0.16 * arc;

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
