#version 330 core
out vec4 fragColor;
/**
 * @file HopfFibrationStreamlines.frag
 * @brief HOPF FIBRATION STREAMLINES: 4D-to-3D Hopf Fibration (S3 -> S2) raymarching.
 * Luminous interlocking linked fiber tori, relativistic circular streamlines,
 * and high-velocity electric pulse cascades.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous circular stream flow along fiber links
 *   audioKick    -> flashes fiber linkage nodes & expands fiber tube radius
 *   audioCentroid-> modulates fiber density & fine stream resolution
 *   audioSubBass -> expands fiber bundle breathing
 *   audioChromaHue-> rotates the luminous Hopf fiber spectrum
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
uniform float fiberDensityP;
uniform float tubeRadiusP;
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

// Distance estimator for nested Hopf fiber tori in 3D
float mapHopf(vec3 p, float t, float fiberDens, float tubeR, out float fiberPhase) {
    float r = length(p);
    // Stereographic coordinates to S3
    float r2 = dot(p, p);
    vec4 q4 = vec4(2.0 * p, r2 - 1.0) / (r2 + 1.0);

    // Hopf base map: (q4.x^2 + q4.y^2 - q4.z^2 - q4.w^2, 2(q4.x*q4.w + q4.y*q4.z), 2(q4.y*q4.w - q4.x*q4.z))
    float u = atan(q4.y, q4.x);
    float v = atan(q4.w, q4.z);

    fiberPhase = u + v + t * 2.0;

    // Toroidal nested shell distance
    float dTor = abs(length(vec2(length(p.xy) - 1.6, p.z)) - 0.7) - tubeR;

    // Streamline periodic ribs
    float streamRib = abs(sin((u - v) * (6.0 * fiberDens) + t * 4.0));
    return dTor + streamRib * 0.04;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float fDens = (fiberDensityP > 0.01) ? fiberDensityP : 1.0;
    float tR = (tubeRadiusP > 0.01) ? tubeRadiusP : 0.08;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.28 * spd;

    // Orbital camera ray setup
    float camDist = 3.2 + 0.4 * sin(audioSwell * 2.0);
    float camA = t * 0.25 + audioPhase * 0.1;
    vec3 ro = vec3(cos(camA) * camDist, 1.2 * sin(t * 0.3), sin(camA) * camDist);
    vec3 ta = vec3(0.0, 0.0, 0.0);

    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + (1.25 + 0.2 * sin(audioSwell)) * ww);

    float tubeRadius = (tR + 0.02 * audioSubBass);

    // Raymarching through Hopf fiber field
    float totDist = 0.0;
    float minD = 1e4;
    float hitPhase = 0.0;
    vec3 hitCol = vec3(0.0);

    for (int i = 0; i < 52; i++) {
        vec3 p = ro + rd * totDist;
        float curPhase;
        float d = mapHopf(p, t, fDens, tubeRadius, curPhase);
        minD = min(minD, abs(d));

        if (abs(d) < 0.003 || totDist > 8.0) {
            hitPhase = curPhase;
            vec2 sampleUV = fract(vec2(atan(p.y, p.x) / 6.2831853 + 0.5, p.z * 0.3));
            vec3 texCol = img(sampleUV);
            vec3 pal = imgPalette(hitPhase * 0.15 + t * 0.05);
            hitCol = mix(texCol, pal, 0.5) * (0.7 + 0.4 * (1.0 - d));
            break;
        }

        totDist += max(0.02, d * 0.7);
    }

    // Glowing fiber streamlines & kick flash
    float fiberGlow = exp(-minD * (24.0 + 12.0 * audioCentroid)) * glw;
    vec3 fiberTint = vec3(1.3, 1.1, 1.8) * fiberGlow * (1.0 + 2.5 * audioKick);

    // Background Hopf field flare
    vec3 bgCol = imgPalette(length(uv) * 0.4 + 0.3) * (0.2 + 0.15 * audioLevel);

    vec3 finalCol = mix(bgCol, hitCol, clamp(length(hitCol), 0.0, 1.0));
    finalCol += fiberTint;

    finalCol = pow(finalCol, vec3(0.88));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
