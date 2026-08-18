#version 330 core
out vec4 fragColor;
/**
 * @file FxLichtenbergLightningWipe.frag
 * @brief FX LICHTENBERG LIGHTNING WIPE: High-voltage electrical dielectric breakdown.
 * Luminous fractal Lichtenberg discharge trees branch violently across the
 * glass plate, conducting electrical arcs that ionize and cross-fade between scenes.
 *   interpolation -> sweeps dielectric breakdown wave front across the viewport
 *   audioKick     -> triggers full-screen high-voltage lightning discharge arcs
 *   audioHigh     -> sharpens micro-fractal streamer tip branches
 *
 * Per-activation variety:
 *   branchP  float Lichtenberg fractal branch density   (0.5..2.2)
 *   voltageP float electrical arc ionization intensity  (0.5..2.0)
 *   speedP   float animation speed multiplier           (0.5..2.0)
 *   hueP     float plasma ionization hue offset         (0..6.28)
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

uniform float branchP;
uniform float voltageP;
uniform float speedP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

float hash21(vec2 p) {
    p = fract(p * vec2(534.34, 835.21));
    p += dot(p, p + 62.32);
    return fract(p.x * p.y);
}

void main() {
    float brn = (branchP  > 0.0) ? branchP  : 1.0;
    float vlt = (voltageP > 0.0) ? voltageP : 1.0;
    float spd = (speedP   > 0.0) ? speedP   : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.5 * spd + audioAdvance * 0.25;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Fractal lightning tree branching (DLA / Lichtenberg structure)
    float arcPattern = 0.0;
    vec2 curP = p * 4.0 * brn;

    for (int i = 0; i < 4; ++i) {
        float noiseVal = sin(curP.y * 3.0 + t * 4.0) + cos(curP.x * 3.0 - t * 3.0);
        float distToLine = abs(curP.x + noiseVal * 0.3);
        float arc = exp(-distToLine * 30.0);
        arcPattern = max(arcPattern, arc * (1.0 / float(i + 1)));

        curP = curP * 2.0 + vec2(sin(t), cos(t));
    }

    // Breakdown sweep front
    float sweepFront = mix(-1.2, 1.2, tProg);
    float distToSweep = p.x - sweepFront;

    // Ionization plasma displacement
    vec2 plasmaDisp = vec2(arcPattern, sin(p.y * 20.0 + t * 5.0)) * 0.03 * midTransition * (1.0 + audioBass * 0.6);

    vec4 c1 = texture(tex1, fract(uv + plasmaDisp));
    vec4 c0 = texture(tex0, fract(uv - plasmaDisp));

    float wipeMask = smoothstep(-0.04, 0.04, distToSweep);
    vec4 col = mix(c0, c1, wipeMask);

    // High-voltage ozone blue-violet ionization arc
    vec3 arcColor = mix(vec3(0.2, 0.8, 1.0), vec3(0.8, 0.3, 1.0), sin(p.y * 10.0) * 0.5 + 0.5);
    float dischargeGlow = (arcPattern + exp(-abs(distToSweep) * 20.0)) * midTransition * vlt;
    col.rgb += dischargeGlow * arcColor * (1.6 + audioKick * 3.5 + audioHigh * 1.5);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue);

    fragColor = col;
}
