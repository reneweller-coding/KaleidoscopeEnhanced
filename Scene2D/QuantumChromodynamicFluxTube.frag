#version 330 core
out vec4 fragColor;
/**
 * @file QuantumChromodynamicFluxTube.frag
 * @brief QUANTUM CHROMODYNAMIC FLUX TUBE: Microscopic QCD color field visualization.
 * Relativistic gluon flux tube strings connecting color-charged quarks (Red/Green/Blue)
 * in a nucleon with non-Abelian SU(3) vacuum foam fluctuations and string tension bursts.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous gluon flux tube vibration & quark rotation
 *   audioKick    -> flashes quark color charge singularities & flux tube string snaps
 *   audioCentroid-> modulates non-Abelian SU(3) vacuum fluctuation frequency
 *   audioSubBass -> expands nucleon color bag radius breathing
 *   audioChromaHue-> steers the fundamental RGB quark color charge spectrum
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
uniform float tensionP;
uniform float quarkRadiusP;
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

// Distance from point p to line segment (a, b)
float sdSegment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float tens = (tensionP > 0.01) ? tensionP : 1.0;
    float qR = (quarkRadiusP > 0.01) ? quarkRadiusP : 0.65;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.32 * spd;

    // 3 Quarks (Red, Green, Blue) orbiting in a triangular nucleon bag
    float bagR = (qR + 0.15 * sin(audioSwell * 2.5) + 0.1 * audioSubBass);
    vec2 q1 = vec2(cos(t * 0.8), sin(t * 0.8)) * bagR;
    vec2 q2 = vec2(cos(t * 0.8 + 2.094395), sin(t * 0.8 + 2.094395)) * bagR;
    vec2 q3 = vec2(cos(t * 0.8 + 4.188790), sin(t * 0.8 + 4.188790)) * bagR;

    // Center Fermat / Torricelli junction point of the Y-shaped gluon flux tube
    vec2 junction = vec2(sin(t * 1.2), cos(t * 1.5)) * 0.08;

    // Distance to 3 vibrating gluon flux tube strings meeting at junction
    float dStr1 = sdSegment(uv, q1, junction);
    float dStr2 = sdSegment(uv, q2, junction);
    float dStr3 = sdSegment(uv, q3, junction);

    // High-frequency quantum string vibrations along the tubes
    float stringVib = sin(uv.x * 25.0 + uv.y * 25.0 - t * 8.0) * (0.02 * tens);
    float minStringDist = min(min(dStr1, dStr2), dStr3) + stringVib;

    // Distance to 3 quark charge nodes
    float dQ1 = length(uv - q1);
    float dQ2 = length(uv - q2);
    float dQ3 = length(uv - q3);

    // Glowing flux tube string filaments
    float tubeGlow = exp(-abs(minStringDist) * (26.0 + 14.0 * audioCentroid)) * glw;

    // Quark node glowing color charges (Red, Green, Blue)
    float qGlow1 = exp(-dQ1 * 18.0) * (1.2 + 2.5 * audioKick);
    float qGlow2 = exp(-dQ2 * 18.0) * (1.2 + 2.5 * audioKick);
    float qGlow3 = exp(-dQ3 * 18.0) * (1.2 + 2.5 * audioKick);

    vec3 quarkColors = vec3(qGlow1, qGlow2, qGlow3);

    // Sample distorted background photo
    vec2 sampleUV = fract(uv * 0.4 + vec2(t * 0.05, 0.0) + 0.5);
    vec3 texCol = img(sampleUV);

    // Gluon flux tube palette
    vec3 palTube = imgPalette(minStringDist * 0.5 + t * 0.1);
    vec3 fluxCol = mix(texCol, palTube, 0.4) * 0.35;

    // Combine glowing strings & quark color charges
    vec3 stringTint = vec3(1.3, 1.2, 1.7) * tubeGlow * (1.0 + 2.5 * audioKick);
    vec3 quarkTint = vec3(1.6 * qGlow1, 1.4 * qGlow2, 1.8 * qGlow3);

    vec3 finalCol = fluxCol + stringTint + quarkTint;

    // Junction center color singlet flash
    float junctionFlash = exp(-length(uv - junction) * 12.0) * (1.0 + 2.0 * audioKick);
    finalCol += vec3(1.8, 1.7, 1.9) * junctionFlash;

    finalCol = pow(finalCol, vec3(0.88));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
