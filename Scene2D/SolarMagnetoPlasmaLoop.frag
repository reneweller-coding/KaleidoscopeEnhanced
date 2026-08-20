#version 330 core
out vec4 fragColor;
/**
 * @file SolarMagnetoPlasmaLoop.frag
 * @brief SOLAR MAGNETO PLASMA LOOP: Twisted magnetic helical coronal loops emerging
 * from a boiling solar photosphere with coronal reconnection flares, solar prominence
 * arcs, and high-energy coronal mass ejection (CME) shockwaves.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous solar magnetic convection & helical loop twist
 *   audioKick    -> triggers violent magnetic reconnection flares & CME plasma bursts
 *   audioCentroid-> sharpens magnetic flux rope filament resolution
 *   audioSubBass -> expands photospheric granulation convection boiling
 *   audioChromaHue-> steers the extreme solar flare hydrogen/helium spectrum
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
uniform float loopCountP;
uniform float flareIntensityP;
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
    float nLoops = (loopCountP > 1.0) ? loopCountP : 3.0;
    float flareInt = (flareIntensityP > 0.01) ? flareIntensityP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.32 * spd;

    // Boiling solar surface granulation background
    float granNoise = sin(uv.x * 20.0 + t * 2.0) * cos(uv.y * 20.0 - t * 1.5);
    float gran = smoothstep(-0.4, 0.8, granNoise) * (0.6 + 0.4 * audioSubBass);

    vec3 loopAcc = vec3(0.0);
    float flareAcc = 0.0;

    // Accumulate across multiple magnetic coronal loops
    int numL = int(clamp(nLoops, 2.0, 5.0));
    for (int k = 0; k < 4; k++) {
        if (k >= numL) break;
        float kf = float(k);

        // Parametric semi-circular coronal loop arc centered at bottom
        float arcRadius = 0.55 + kf * 0.25 + 0.1 * sin(audioSwell * 2.5 + kf);
        vec2 arcCenter = vec2((kf - 1.5) * 0.35 + sin(t * 0.4 + kf) * 0.15, -0.4);

        vec2 rel = uv - arcCenter;
        float rArc = length(rel);
        float aArc = atan(rel.y, rel.x);

        // Distance to the coronal loop tube
        float dLoop = abs(rArc - arcRadius) - 0.03;

        // Helical magnetic twisting along the loop arc
        float helixTwist = sin(aArc * 16.0 + rArc * 12.0 - t * 5.0 + kf);
        float loopFilament = exp(-abs(dLoop + helixTwist * 0.02) * (24.0 + 12.0 * audioCentroid));

        // Reconnection flare at the apex of the loop (aArc near pi/2)
        float apexDist = length(rel - vec2(0.0, arcRadius));
        float flareNode = exp(-apexDist * 14.0) * (1.0 + 3.0 * audioKick) * flareInt;
        flareAcc += flareNode;

        // Color gradient of loop (golden hydrogen alpha to extreme ultraviolet core)
        vec3 loopCol = mix(vec3(1.8, 1.2, 0.2), vec3(1.9, 0.3, 0.8), clamp(rel.y / arcRadius, 0.0, 1.0));
        loopCol = mix(loopCol, imgPalette(kf * 0.25 + 0.1), 0.35);

        loopAcc += (loopCol * loopFilament + vec3(1.9, 1.8, 1.4) * flareNode) * glw;
    }

    // Sample distorted background photo
    vec2 sampleUV = fract(uv * 0.4 + vec2(t * 0.05, gran * 0.05) + 0.5);
    vec3 texCol = img(sampleUV);

    // Photosphere surface base
    vec3 photosphereCol = mix(vec3(1.6, 0.8, 0.1), vec3(1.2, 0.2, 0.1), gran);
    vec3 baseCol = mix(photosphereCol, texCol, 0.35);

    vec3 finalCol = baseCol * 0.4 + loopAcc;

    // Global coronal halo flare
    float coronalGlow = exp(-length(uv + vec2(0.0, 0.4)) * 3.0) * (0.8 + 1.5 * audioKick);
    finalCol += imgPalette(0.85) * coronalGlow;

    finalCol = pow(finalCol, vec3(0.88));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
