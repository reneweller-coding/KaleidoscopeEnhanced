#version 330 core
out vec4 fragColor;
/**
 * @file VillarceauCirclesHyperFlow.frag
 * @brief VILLARCEAU CIRCLES HYPER FLOW: Bitangential oblique planar slices of a torus
 * producing pairs of perfectly circular Villarceau circles. Intertwined counter-swirling
 * luminous rings, high-contrast chromatic trails, and phase-locked geometric flow.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous counter-rotation of Villarceau circle pairs
 *   audioKick    -> flashes circle intersection nodes & radial shockwaves
 *   audioCentroid-> sharpens Villarceau circular ribbon edge resolution
 *   audioSubBass -> expands torus major/minor radius ratio breathing
 *   audioChromaHue-> rotates the luminous Villarceau rainbow palette
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
uniform float ringCountP;
uniform float ribbonP;
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
    float nRings = (ringCountP > 1.0) ? ringCountP : 6.0;
    float rMod = (ribbonP > 0.01) ? ribbonP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = time * 0.192 * spd + audioAdvance * 0.192 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Torus parameters: R (major), r (minor)
    float R = 1.2 * (1.0 + 0.1 * sin(audioSwell * 2.0));
    float rTor = 0.55 * (1.0 + 0.15 * audioSubBass);

    vec3 colAcc = vec3(0.0);
    float glowAcc = 0.0;
    float totalWeight = 0.0;

    // Accumulate across multiple inclined Villarceau circle pairs
    int numR = int(clamp(nRings, 4.0, 8.0));
    for (int k = 0; k < 6; k++) {
        if (k >= numR) break;
        float kf = float(k);

        // Rotation angle of cutting plane pair
        float aPlane = t * 0.25 + kf * (3.14159265 / float(numR));
        float cs = cos(aPlane), sn = sin(aPlane);
        vec2 p = mat2(cs, -sn, sn, cs) * uv * 2.2;

        // Centers of two Villarceau circles on the bitangential plane: (+- sqrt(R*r), 0)
        float dOffset = sqrt(R * rTor);
        vec2 c1 = vec2(dOffset, 0.0);
        vec2 c2 = vec2(-dOffset, 0.0);

        float rCircle = R; // Radius of Villarceau circle equals major radius R

        float dCircle1 = abs(length(p - c1) - rCircle);
        float dCircle2 = abs(length(p - c2) - rCircle);

        // Luminous circular ribbon filaments
        float g1 = exp(-dCircle1 * (24.0 + 12.0 * audioCentroid) * rMod);
        float g2 = exp(-dCircle2 * (24.0 + 12.0 * audioCentroid) * rMod);

        // Flowing phase pulses along circles
        float flow1 = sin(atan(p.y - c1.y, p.x - c1.x) * 6.0 + t * 4.0 + kf);
        float flow2 = sin(atan(p.y - c2.y, p.x - c2.x) * 6.0 - t * 4.0 + kf);

        vec3 pal1 = imgPalette(kf * 0.2 + t * 0.05);
        vec3 pal2 = imgPalette(kf * 0.2 + 0.5);

        vec3 ringCol1 = pal1 * g1 * (0.8 + 0.4 * flow1);
        vec3 ringCol2 = pal2 * g2 * (0.8 + 0.4 * flow2);

        colAcc += (ringCol1 + ringCol2);
        glowAcc += (g1 + g2);
        totalWeight += 1.0;
    }

    // Sample distorted background photo
    vec2 sampleUV = fract(uv * 0.4 + 0.5);
    vec3 texCol = img(sampleUV);

    vec3 finalCol = mix(texCol * 0.3, colAcc, clamp(glowAcc, 0.0, 1.0));

    // Glowing Villarceau intersection node flashes
    vec3 nodeTint = vec3(1.4, 1.1, 1.8) * glowAcc * glw * (1.0 + 2.5 * audioKick);
    finalCol += nodeTint;

    finalCol = pow(finalCol, vec3(0.88));
    finalCol *= 0.78;   // measured luma 0.640: knee, not a linear trim
    finalCol /= 1.0 + 0.45 * max(finalCol.r, max(finalCol.g, finalCol.b));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
