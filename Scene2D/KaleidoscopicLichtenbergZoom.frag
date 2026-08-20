#version 330 core
out vec4 fragColor;
/**
 * @file KaleidoscopicLichtenbergZoom.frag
 * @brief KALEIDOSCOPIC LICHTENBERG ZOOM: Infinite recursive zoom into high-voltage
 * dielectric Lichtenberg electrical discharge trees folded across hexagonal mirror
 * symmetries with searing lightning sparks, charge streamers, and kick flashes.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous deep lightning tree zoom trajectory
 *   audioKick    -> strikes violent high-voltage discharge arcs & flashes
 *   audioCentroid-> modulates streamer branching frequency & electrical spark density
 *   audioSubBass -> expands plasma tree voltage glow
 *   audioChromaHue-> rotates the electrical discharge spectrum
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
uniform float voltageP;
uniform float branchP;
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

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float volt = (voltageP > 0.01) ? voltageP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.35 * spd;

    // Logarithmic continuous zoom into discharge core
    float zoomLevel = exp(mod(t * 0.7, 5.0));
    vec2 p = uv / zoomLevel;

    // 6-Fold hexagonal kaleidoscope symmetry
    float a = atan(p.y, p.x);
    float r = length(p);
    float seg = 3.14159265 / 3.0;
    a = mod(a + seg * 0.5, seg) - seg * 0.5;
    a = abs(a);
    vec2 z = vec2(cos(a), sin(a)) * r;

    // Lichtenberg recursive electrical tree calculation
    float minArcDist = 1e5;
    float plasmaEnergy = 0.0;

    for (int i = 0; i < 8; i++) {
        float fi = float(i);
        // Jagged electrical noise offset
        float zig = sin(z.y * (10.0 + fi * 4.0) + t * 3.0 + fi) * 0.08 * volt;
        float dLine = abs(z.x - zig);

        // Normalise by the SAME per-iteration scale the fold below actually
        // applies (1.45) -- the previous 1.35 divisor didn't match, so the
        // reported distance drifted further from correct at every iteration.
        minArcDist = min(minArcDist, dLine / pow(1.45, fi));

        // Scale and branch fold
        z = abs(z) - vec2(0.25 + 0.05 * sin(t * 2.0 + fi), 0.35);
        float rotArc = 0.6 + 0.2 * sin(t + fi);
        z = mat2(cos(rotArc), -sin(rotArc), sin(rotArc), cos(rotArc)) * z;
        z *= 1.45;

        plasmaEnergy += exp(-dLine * 15.0);
    }

    // Dynamic texture sample mapped across plasma tree
    vec2 sampleUV = fract(z * 0.25 + 0.5);
    vec3 texCol = img(sampleUV);

    // Glowing lightning arc lines. minArcDist's per-iteration numerator stays
    // a bounded, O(0.01-0.1) quantity while its pow(1.45,fi) divisor keeps
    // growing, so by i=7 it's crushed near zero for almost every pixel (not
    // just ones truly near an arc) -- matching the normalisation constant to
    // the fold's real scale factor (see minArcDist above) wasn't enough on
    // its own, the decay here also has to be sharp enough to turn that
    // near-zero-everywhere value back into real near/far contrast.
    float arcGlow = exp(-minArcDist * (160.0 + 80.0 * audioCentroid)) * glw;
    float coreSpark = exp(-minArcDist * 500.0);

    // Palette mixing
    vec3 palA = imgPalette(plasmaEnergy * 0.15 + t * 0.1);
    vec3 palB = imgPalette(plasmaEnergy * 0.15 + 0.5);
    vec3 col = mix(palA, palB, 0.5 + 0.5 * sin(plasmaEnergy + t));

    col = mix(col, texCol, 0.35 + 0.15 * audioValence);

    // Add high-voltage electric blue/violet arcs & white spark cores
    vec3 arcColor = vec3(1.1, 1.4, 1.9) * arcGlow * (1.0 + 2.5 * audioKick);
    vec3 sparkColor = vec3(1.8, 1.8, 2.0) * coreSpark * (1.5 + 3.5 * audioKick);
    col += arcColor + sparkColor;

    // Ambient discharge haze
    col += imgPalette(0.8) * plasmaEnergy * 0.08 * audioLevel;

    col = pow(col, vec3(0.86));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
