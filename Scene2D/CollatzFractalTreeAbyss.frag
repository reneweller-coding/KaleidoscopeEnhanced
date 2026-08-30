#version 330 core
out vec4 fragColor;
/**
 * @file CollatzFractalTreeAbyss.frag
 * @brief COLLATZ FRACTAL TREE ABYSS: Analytic complex continuation of the Collatz (3n+1)
 * map f(z) = (1 + 4z - (1+2z)cos(pi*z))/4. Infinite fractal spires, needle feathers,
 * and high-voltage spiky branching forests.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous complex plane zoom & spire navigation
 *   audioKick    -> flashes Collatz parity branch singularity nodes
 *   audioCentroid-> sharpens transcendental cosine needle oscillations
 *   audioSubBass -> expands branch needle thickness breathing
 *   audioChromaHue-> rotates the spiky needle forest spectrum
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
uniform float zoomP;
uniform float needleP;
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

// Complex arithmetic helpers
vec2 cMul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 cCos(vec2 z) {
    return vec2(cos(z.x) * cosh(z.y), -sin(z.x) * sinh(z.y));
}

// Complex analytic Collatz map: f(z) = (1 + 4z - (1 + 2z)*cos(pi*z)) / 4
vec2 collatzMap(vec2 z) {
    float pi = 3.14159265;
    vec2 piZ = z * pi;
    vec2 cosPiZ = cCos(piZ);
    vec2 term1 = vec2(1.0, 0.0) + 4.0 * z;
    vec2 term2 = cMul(vec2(1.0, 0.0) + 2.0 * z, cosPiZ);
    return (term1 - term2) * 0.25;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float zm = (zoomP > 0.01) ? zoomP : 1.0;
    float ndl = (needleP > 0.01) ? needleP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = time * 0.150 * spd + audioAdvance * 0.150 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Zoom into Collatz fractal spire boundary. The old base multiplier
    // (2.2) kept |z| under ~0.4 at screen edges even at zoomProg=0 -- well
    // inside this map's basin of convergence, so almost every pixel just
    // spirals toward a fixed point without ever crossing r2>64. iterCount
    // then hits the "never escaped" fallback (=24) for nearly the whole
    // frame, and only the weak trap term was left to vary the flat wash.
    // A smaller base multiplier widens the visible |z| range enough to
    // actually reach the escape boundary.
    // exp(mod(t * 0.6, 5.0)) snapped from e^5 (148x) back to e^0 every ~8.3 s
    // -- a hard cut. A raised cosine over the same period dives in and eases
    // back out instead: continuous in value AND velocity (the derivative
    // vanishes at both turns), so no seam anywhere.
    float zc = 0.5 - 0.5 * cos(6.2831853 * fract(t * 0.6 / 5.0));   // 0..1..0
    float zoomLevel = exp(zc * 5.0) * (0.55 * zm);
    vec2 z = uv / zoomLevel;

    // Translation along real axis
    z.x += t * 0.2;

    float iterCount = 0.0;
    float trap = 1e5;

    for (int i = 0; i < 24; i++) {
        z = collatzMap(z);

        float r2 = dot(z, z);
        trap = min(trap, abs(z.y) + abs(sin(z.x * 3.14159)));

        if (r2 > 64.0) {
            // Smooth (fractional) escape count: the integer count painted a
            // hard concentric stripe per iteration on every exterior shell.
            iterCount = float(i) - log2(max(1.0, log2(r2) / 6.0));
            break;
        }
    }

    if (iterCount == 0.0) iterCount = 24.0;

    // Sample texture on chaotic coordinate
    vec2 sampleUV = fract(z * 0.25 + 0.5);
    vec3 texCol = img(sampleUV);

    // Glowing spiky needle lines. Deep interior points (the ones that never
    // escape, iterCount==24) also tend to spiral toward the real axis where
    // trap approaches 0 -- the same near-zero trap this glow was meant to
    // reserve for actual boundary needles -- so exp(-trap*K) saturates to
    // ~1 across the ENTIRE non-escaping interior, not just its filigree
    // edge, and flooded the whole centre with full-strength white tint.
    // Sub-bass divides the falloff constant rather than adding light: a smaller
    // exponent widens the trap band each needle occupies, so the filigree
    // breathes THICKER on drones without raising its peak brightness.
    float needleGlow = exp(-trap * (20.0 + 10.0 * audioCentroid) * ndl / (1.0 + 0.45 * audioSubBass)) * glw;
    if (iterCount >= 23.5) needleGlow *= 0.15;
    // The interior was one flat colour field (iterCount pinned at 24 makes
    // the palette constant).  Carve concentric potential bands out of the
    // orbit trap so the abyss reads as DEPTH instead of a blob.
    float abyssBand = 1.0;
    if (iterCount >= 23.5)
        abyssBand = 0.13 + 0.55 * pow(0.5 + 0.5 * sin(length(z) * 7.0 + trap * 30.0
                                                      - t * 1.6 + audioPhase * 0.25), 2.0);

    // Palette mixing
    // Slow palette sweep, no per-iteration sin flip -- both were stripe
    // factories on top of the integer count.
    vec3 palA = imgPalette(iterCount * 0.03 + trap * 0.12);
    vec3 palB = imgPalette(iterCount * 0.03 + 0.5);
    vec3 col = mix(palA, palB, 0.5 + 0.5 * sin(iterCount * 0.25 + t));

    col = mix(col, texCol, 0.35 + 0.15 * audioValence);
    col *= abyssBand;

    // Add glowing spiky tree needles and kick flash
    vec3 needleTint = vec3(1.2, 1.4, 1.8) * needleGlow * (1.0 + 2.5 * audioKick);
    col += needleTint;

    col = pow(col, vec3(0.88));
    vec3 _catTone = clamp(col, 0.0, 1.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
