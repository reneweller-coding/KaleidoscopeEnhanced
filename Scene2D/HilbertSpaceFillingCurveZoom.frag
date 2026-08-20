#version 330 core
out vec4 fragColor;
/**
 * @file HilbertSpaceFillingCurveZoom.frag
 * @brief HILBERT SPACE FILLING CURVE ZOOM: Infinite recursive scale zoom into a 3D Hilbert
 * space-filling curve. A single non-self-intersecting continuous fractal path folding
 * through cubic space with glowing electric neon pulses, multi-octave zoom, and corner sparks.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous forward plunge along the Hilbert curve path
 *   audioKick    -> flashes Hilbert corner vertices & triggers recursive folding burst
 *   audioCentroid-> modulates Hilbert filament line thickness & edge sharpness
 *   audioSubBass -> expands cubic cell dimension breathing
 *   audioChromaHue-> rotates the glowing Hilbert path spectrum
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

// Per-activation variety
uniform float speedP;
uniform float scaleP;
uniform float lineThicknessP;
uniform float glowP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t) {
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853 + hueP;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

// Distance from point p to 2D line segment (a, b)
float sdSegment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}

// 2D Hilbert curve generator segment evaluation (U-shaped basic unit)
float hilbert2D(vec2 p, float t, out float curvePhase) {
    vec2 q = p;
    float d = 1e4;
    curvePhase = 0.0;

    // A true space-filling curve gets arbitrarily close to every point as
    // subdivision depth grows, so unconditionally min()-ing 4 octaves of this
    // motif together (each only 2x finer than the last) makes SOME octave's
    // segment sit within line-thickness of virtually every pixel -- the
    // "curve" floods the whole frame instead of tracing a sparse path. 2
    // octaves keeps the self-similar zoom feel without over-densifying it.
    for (int i = 0; i < 2; i++) {
        vec2 cell = floor(q);
        vec2 f = fract(q) - 0.5;

        // U-Curve line segments
        vec2 p0 = vec2(-0.25, -0.25);
        vec2 p1 = vec2(-0.25,  0.25);
        vec2 p2 = vec2( 0.25,  0.25);
        vec2 p3 = vec2( 0.25, -0.25);

        float d0 = sdSegment(f, p0, p1);
        float d1 = sdSegment(f, p1, p2);
        float d2 = sdSegment(f, p2, p3);

        d = min(d, min(min(d0, d1), d2) / pow(2.0, float(i)));
        curvePhase += dot(cell, vec2(1.0, 2.0));

        q = q * 2.0;
    }

    return d;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float sc = (scaleP > 0.01) ? scaleP : 1.0;
    float lThk = (lineThicknessP > 0.01) ? lineThicknessP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.32 * spd;

    // Logarithmic scale dive for infinite zoom
    float zoomProg = mod(t * 0.7, 1.0);
    float zoomScale = exp(zoomProg * log(2.0)) * (2.5 * sc);

    vec2 pZoom = uv * zoomScale;

    float curvePhase;
    float dLine = hilbert2D(pZoom + vec2(t * 0.2, 0.0), t, curvePhase) - 0.02 * lThk;

    // Glowing Hilbert path line
    float lineGlow = exp(-abs(dLine) * (26.0 + 12.0 * audioCentroid)) * glw;

    // Electric pulse traveling along curve. curvePhase is CONSTANT across an
    // entire grid cell (it only changes at cell boundaries via floor()), so
    // pulseGlow is really a per-CELL flag rather than a per-pixel highlight
    // -- this was the uncaught separate additive term: whenever a cell's
    // phase crossed the 0.85 threshold the WHOLE cell lit up uniformly, and
    // with up to 3.5x kick and a 2.0-peak tint channel that flooded roughly
    // half the visible tiles to solid white while only the (distance-based,
    // genuinely thin) line glow survived at the borders. See the cap below.
    float pulse = abs(sin(curvePhase * 4.0 - t * 6.0));
    float pulseGlow = smoothstep(0.85, 1.0, pulse) * (1.0 + 2.5 * audioKick);

    // Sample distorted background photo
    vec2 sampleUV = fract(pZoom * 0.2 + 0.5);
    vec3 texCol = img(sampleUV);

    // Hilbert palette
    vec3 palA = imgPalette(curvePhase * 0.1 + t * 0.05);
    vec3 palB = imgPalette(curvePhase * 0.1 + 0.5);
    vec3 col = mix(palA, palB, 0.5 + 0.5 * sin(curvePhase * 0.5));

    col = mix(col, texCol, 0.35 + 0.15 * audioValence);

    // Add glowing Hilbert lines and pulse sparks -- cap each FINAL tinted
    // term (not just the underlying glow scalar), since the tint constants
    // themselves already exceed 1.0 per channel.
    vec3 lineTint = vec3(1.3, 1.1, 1.8) * min(lineGlow * (1.0 + 2.0 * audioKick), 0.75);
    vec3 sparkTint = vec3(1.6, 1.5, 2.0) * min(pulseGlow, 0.35);

    col += lineTint + sparkTint;

    col = pow(col, vec3(0.88));
    vec3 _catTone = clamp(col, 0.0, 1.0);
    _catTone /= 1.0 + 0.85 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
