#version 330 core
out vec4 fragColor;
/**
 * @file HyperspaceGridToroidTube.frag
 * @brief HYPERSPACE GRID TOROID TUBE: High-speed 3D flight within the curved lumen
 * of a giant toroidal geometry tube. Pulsing kinetic neon polygon scales,
 * curving camera bankings, and high-frequency energy grid waves.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous forward flight progression inside the toroid
 *   audioKick    -> flashes polygon scale grid vertices & energy pulses
 *   audioCentroid-> modulates kinetic scale tessellation frequency
 *   audioSubBass -> expands toroid minor tube radius breathing
 *   audioChromaHue-> rotates the luminous neon grid palette
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
uniform float gridFreqP;
uniform float radiusP;
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

// Distance estimator inside curved Toroid tube
float mapToroidTube(vec3 p, float rMajor, float rMinor, out vec2 uvCoord) {
    float r = length(p.xy);
    float aMajor = atan(p.y, p.x);
    float aMinor = atan(p.z, r - rMajor);

    uvCoord = vec2(aMajor, aMinor);

    // Inverted distance to inner wall of torus
    float dWall = rMinor - length(vec2(r - rMajor, p.z));
    return dWall;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float gFreq = (gridFreqP > 0.01) ? gridFreqP : 1.0;
    float rMod = (radiusP > 0.01) ? radiusP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.38 * spd;

    float rMajor = 3.5 * rMod;
    float rMinor = 1.15 * (1.0 + 0.15 * sin(audioSwell * 2.5) + 0.1 * audioSubBass);

    // Camera ride coordinate inside toroid
    float aCam = t * 0.7;
    vec3 ro = vec3(cos(aCam) * rMajor, sin(aCam) * rMajor, 0.0);
    vec3 ta = vec3(cos(aCam + 0.1) * rMajor, sin(aCam + 0.1) * rMajor, 0.0);

    vec3 T = normalize(ta - ro);
    vec3 up = vec3(0.0, 0.0, 1.0);
    vec3 right = normalize(cross(T, up));

    vec3 rd = normalize(uv.x * right + uv.y * up + (1.25 + 0.2 * sin(audioSwell * 2.0)) * T);

    // Raymarching to hit inner toroid wall
    float totDist = 0.0;
    vec2 hitUV = vec2(0.0);
    vec3 hitCol = vec3(0.0);

    for (int i = 0; i < 44; i++) {
        vec3 p = ro + rd * totDist;
        vec2 curUV;
        float d = mapToroidTube(p, rMajor, rMinor, curUV);

        if (d < 0.005 || totDist > 8.0) {
            hitUV = curUV;
            break;
        }

        totDist += max(0.02, d * 0.7);
    }

    // Kinetic polygon grid lines on toroid wall
    vec2 gridP_UV = hitUV * vec2(16.0 * gFreq, 12.0 * gFreq) + vec2(t * 3.0, 0.0);
    vec2 gridFract = abs(fract(gridP_UV - 0.5) - 0.5);
    float gridLine = smoothstep(0.08, 0.0, min(gridFract.x, gridFract.y));

    // Sample slideshow texture on toroid coordinates
    vec2 sampleUV = fract(hitUV / 6.2831853 + 0.5);
    vec3 texCol = img(sampleUV);
    vec3 palCol = imgPalette(hitUV.x / 6.2831853 + t * 0.05);

    vec3 wallBase = mix(texCol, palCol, 0.45);
    vec3 gridCol = vec3(1.3, 1.1, 1.8) * gridLine * (1.0 + 2.5 * audioKick) * glw;

    hitCol = wallBase * 0.5 + gridCol;

    // Atmospheric depth fog
    float depthFog = 1.0 - exp(-totDist * 0.25);
    hitCol = mix(hitCol, imgPalette(0.8) * 0.35, depthFog);

    hitCol = pow(hitCol, vec3(0.88));
    fragColor = vec4(clamp(hitCol, 0.0, 1.0), 1.0);
}
