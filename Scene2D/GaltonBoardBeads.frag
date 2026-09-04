#version 330 core
out vec4 fragColor;
/**
 * @file GaltonBoardBeads.frag
 * @brief GALTON BOARD BEADS: the bean machine.  Round beads drop through
 * a triangular lattice of pegs, bouncing left or right at each row, and
 * pile up in the bins below; over the scene arc the heap in the bins
 * grows into the bell curve, which is the whole point of the machine.
 * Every bead falls on its own continuous phase, so beads are always in
 * flight and none ever appears from nothing.  The bins take their colour
 * from the spectrum bands; the kick lights the bin a bead lands in.
 * Camera fixed on the board.
 *
 * Audio Reactivity:
 *   sceneProgress     -> the bins fill toward the curve (the arc)
 *   sceneAdvance      -> the beads fall (continuous)
 *   audioSpectrum[32] -> the bin colours (light)
 *   audioKick         -> the bin that just received one lights (light)
 *   audioHigh         -> the bead sparkle (light)
 *
 * Per-activation variety: rowsP, beadsP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float sceneProgress;
uniform float audioAdvance;
uniform float audioSpectrum[32];
uniform float audioSwell;
uniform float audioHigh;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float rowsP;
uniform float beadsP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float rows = 7.0 + floor(clamp(rowsP, 0.0, 1.0) * 5.0);             // peg rows
    float beads = 8.0 + floor(clamp(beadsP, 0.0, 1.0) * 10.0);
    float lamp = 0.7 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float prog = clamp(sceneProgress, 0.0, 1.0);
    float clock = sceneAdvance * 0.8 + sceneTime * 0.16;

    float topY = 0.42, pegBot = -0.05, binBot = -0.44;
    float pitch = aspect * 0.9 / (rows + 1.0);

    // The case: the photo behind glass, a dark board with a lit face.
    vec3 board = img(uv * 0.8 + 0.1) * mix(vec3(0.2, 0.19, 0.2), imgPalette(hue * 0.159 + 0.6) * 0.3, 0.5);
    board *= 0.7 + 0.4 * noise2(p * 18.0);
    vec3 col = board * lamp * 0.8;

    // The pegs: a triangular lattice, one more peg on each row down.
    for (int r = 0; r < 12; ++r)
    {
        float fr = float(r);
        if (fr >= rows) break;
        float y = topY - 0.06 - (fr + 0.5) * (topY - 0.06 - pegBot) / rows;
        float n = fr + 1.0;
        for (int k = 0; k < 13; ++k)
        {
            float fk = float(k);
            if (fk >= n) break;
            float x = (fk - (n - 1.0) * 0.5) * pitch;
            float d = length(p - vec2(x, y));
            float peg = smoothstep(0.011, 0.007, d);
            col = mix(col, vec3(0.65, 0.66, 0.7) * lamp, peg);
            col += vec3(1.0) * smoothstep(0.005, 0.001, length(p - vec2(x - 0.003, y + 0.003))) * (0.3 + 0.5 * hi);
            // Each peg sits in a small shadow.
            col *= 1.0 - 0.3 * smoothstep(0.017, 0.011, length(p - vec2(x + 0.004, y - 0.004))) * (1.0 - peg);
        }
    }

    // The bins and their heaps: the binomial curve builds over the arc.
    float bins = rows + 1.0;
    float binI = floor((p.x + bins * pitch * 0.5) / pitch);
    float binF = fract((p.x + bins * pitch * 0.5) / pitch);
    if (binI >= 0.0 && binI < bins && p.y < pegBot)
    {
        // The binomial weight for this bin, normalised to its peak.
        float k = binI;
        float mean = (bins - 1.0) * 0.5;
        float sigma = sqrt(rows) * 0.5;
        float w = exp(-pow((k - mean) / max(sigma, 0.3), 2.0) * 0.5);
        float heap = w * (pegBot - binBot) * 0.92 * smoothstep(0.0, 1.0, prog);
        float inHeap = step(binBot, p.y) * step(p.y, binBot + heap);
        int band = int(mod(k * 2.0, 32.0));
        float e = clamp(audioSpectrum[band] * 1.6, 0.0, 1.0);
        vec3 beadCol = imgPalette(hue * 0.159 + float(band) / 32.0) * 1.35 + 0.15;
        // The heap is made of beads, so it must read as round grains.
        vec2 hg = p * 90.0;
        vec2 hc = floor(hg), hf = fract(hg) - 0.5;
        vec2 hj = vec2(hash21(hc + 1.7), hash21(hc + 6.3)) - 0.5;
        float pack = smoothstep(0.42, 0.18, length(hf - hj * 0.6));
        vec3 heapCol = beadCol * (0.45 + 0.6 * pack) * (0.7 + 0.6 * e);
        heapCol += vec3(1.0) * smoothstep(0.2, 0.05, length(hf - hj * 0.6 + vec2(0.12, -0.12))) * (0.15 + 0.5 * hi) * 0.5;
        col = mix(col, heapCol * lamp, inHeap);
        // The bin walls.
        float wall = smoothstep(0.012, 0.006, min(binF, 1.0 - binF) * pitch) * step(p.y, pegBot);
        col = mix(col, vec3(0.5, 0.5, 0.54) * lamp * 0.8, wall);
        // The bin that just received a bead lights on the kick.
        float recent = step(0.86, hash21(vec2(k, floor(clock * 1.4))));
        col += beadCol * inHeap * recent * audioKick * 0.5;
    }

    // The beads in flight.  Each falls on its own phase; its path is a
    // random walk through the peg rows, evaluated as a smooth interpolation
    // between the two peg positions it is between.
    for (int i = 0; i < 18; ++i)
    {
        float fi = float(i);
        if (fi >= beads) break;
        float ph = fract(clock * (0.22 + 0.1 * hash11(fi * 3.7)) + hash11(fi * 5.9));
        // Down the board over the phase.
        float y = mix(topY, pegBot - 0.02, ph);
        // The walk: at each row the bead goes left or right; the position
        // is the running sum, interpolated smoothly between rows.
        float t = ph * rows;
        float ri = floor(t), rf = fract(t);
        float x0 = 0.0, x1 = 0.0;
        for (int r = 0; r < 12; ++r)
        {
            float fr = float(r);
            if (fr > ri) break;
            float step_ = (hash21(vec2(fi, fr)) > 0.5) ? 0.5 : -0.5;
            if (fr < ri) x0 += step_;
            x1 += step_;
        }
        // A smooth arc between the two peg positions, so the bounce reads.
        float xx = mix(x0, x1, smoothstep(0.0, 1.0, rf)) * pitch;
        float bounce = 0.012 * sin(rf * 3.14159);
        vec2 bp = vec2(xx, y + bounce);
        float d = length(p - bp);
        int band = int(mod(fi * 3.0, 32.0));
        float e = clamp(audioSpectrum[band] * 1.6, 0.0, 1.0);
        vec3 bc = imgPalette(hue * 0.159 + float(band) / 32.0) * 1.4 + 0.2;
        float bead = smoothstep(0.013, 0.009, d);
        col = mix(col, bc * (0.7 + 0.6 * e) * lamp, bead);
        col += vec3(1.0) * smoothstep(0.006, 0.002, length(p - bp - vec2(-0.004, 0.004))) * (0.3 + 0.7 * hi);
        col += bc * exp(-d * 45.0) * (0.1 + 0.3 * e);
    }
    // The hopper at the top and the case frame.
    float hopper = step(abs(p.x), 0.055 + (topY - p.y) * 0.35) * step(topY - 0.06, p.y) * step(p.y, 0.47);
    col = mix(col, vec3(0.45, 0.45, 0.48) * lamp, hopper * 0.85);
    float frame = smoothstep(0.012, 0.0, abs(max(abs(p.x) - aspect * 0.46, abs(p.y) - 0.47)));
    col = mix(col, mix(vec3(0.35, 0.26, 0.16), imgPalette(hue * 0.159 + 0.08), 0.25) * lamp, frame);
    col *= 0.9 + 0.2 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
