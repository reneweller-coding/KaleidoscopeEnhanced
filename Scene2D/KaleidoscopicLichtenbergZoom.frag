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

// Overall level of the photo currently on the texture units, from a fixed
// 5-tap grid. Every base colour here is photo-derived and the library spans
// near-black to near-white, so a bright photo left the additive discharge
// arcs no headroom at all. The probe rides the tex0/tex1 crossfade, so the
// gain it feeds can never pop, and because it is one number for the whole
// frame it rescales exposure without touching local contrast.
float photoLevel() {
    vec3 s = img(vec2(0.25, 0.25)) + img(vec2(0.75, 0.25))
           + img(vec2(0.25, 0.75)) + img(vec2(0.75, 0.75))
           + img(vec2(0.50, 0.50));
    return dot(s * 0.2, vec3(0.299, 0.587, 0.114));
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
    // near-zero-everywhere value back into real near/far contrast. It is
    // slightly shallower than before because the arcs were never actually
    // missing -- they were being drawn on top of a photo base already sitting
    // near 1.0, so the entire dynamic range of this term was clipped away.
    // Sub-bass divides the falloff instead of adding light: a shallower
    // exponent widens the band each arc occupies, so the discharge tree's
    // corona swells on drones without lifting its peak.
    float arcGlow = exp(-minArcDist * (130.0 + 60.0 * audioCentroid) / (1.0 + 0.4 * audioSubBass)) * glw;
    float coreSpark = exp(-minArcDist * 500.0);

    // Palette mixing
    vec3 palA = imgPalette(plasmaEnergy * 0.15 + t * 0.1);
    vec3 palB = imgPalette(plasmaEnergy * 0.15 + 0.5);
    vec3 col = mix(palA, palB, 0.5 + 0.5 * sin(plasmaEnergy + t));

    col = mix(col, texCol, 0.35 + 0.15 * audioValence);

    // Hold the dielectric field back to a fixed dark base. A Lichtenberg
    // figure only reads if the medium around it is dark: with a bright photo
    // the base alone sat near 1.0 and the arcs had nowhere left to go, which
    // is what flattened the whole frame to a near-white wash.
    float expGain = clamp(0.22 / max(0.05, photoLevel()), 0.22, 2.4);
    col *= expGain;

    // Add high-voltage electric blue/violet arcs & white spark cores. The tint
    // constants exceed 1.0 per channel on their own, so the TINTED vectors are
    // capped -- capping only the scalar glow left them unbounded.
    vec3 arcColor = min(vec3(1.1, 1.4, 1.9) * arcGlow * (1.0 + 2.5 * audioKick), vec3(1.25));
    vec3 sparkColor = min(vec3(1.8, 1.8, 2.0) * coreSpark * (1.5 + 3.5 * audioKick), vec3(1.5));
    col += arcColor + sparkColor;

    // Ambient discharge haze (on the same exposure gain as the base, since it
    // is a photo sample too -- plasmaEnergy can reach 8 and a bright photo
    // would otherwise re-introduce an unbounded lift here)
    col += imgPalette(0.8) * expGain * plasmaEnergy * 0.08 * audioLevel;

    col = pow(col, vec3(0.86));
    vec3 _catTone = clamp(col, 0.0, 1.0);
    _catTone /= 1.0 + 0.30 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
