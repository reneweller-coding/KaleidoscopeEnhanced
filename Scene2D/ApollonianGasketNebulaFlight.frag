#version 330 core
out vec4 fragColor;
/**
 * @file ApollonianGasketNebulaFlight.frag
 * @brief APOLLONIAN GASKET NEBULA FLIGHT: 3D Raymarching camera flight through
 * nested Apollonian sphere packing gasket voids immersed in glowing volumetric
 * cosmic nebula clouds with metallic reflections.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous forward 3D flight trajectory
 *   audioKick    -> flashes sphere shell caustics & nebula density burst
 *   audioCentroid-> modulates sphere packing folding scale
 *   audioSubBass -> expands sphere breathing radius
 *   audioChromaHue-> steers the nebula & metallic reflection palette
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
uniform float densityP;
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

// 3D Apollonian sphere packing distance estimator
float mapApollonian(vec3 p, float scaleMod, out float orbitTrap) {
    float scale = 1.0;
    orbitTrap = 1e5;

    for (int i = 0; i < 7; i++) {
        p = -1.0 + 2.0 * fract(0.5 * p + 0.5);

        float r2 = dot(p, p);
        orbitTrap = min(orbitTrap, r2);

        float k = max(0.25 / r2, 1.0) * (1.0 + 0.1 * audioSubBass);
        p *= k;
        scale *= k;
    }

    return 0.25 * abs(p.y) / scale;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float sc = (scaleP > 0.01) ? scaleP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.3 * spd;

    // Flight camera position weaving through Apollonian voids
    vec3 ro = vec3(
        sin(t * 0.4) * 0.8,
        t * 0.9,
        cos(t * 0.35) * 0.8
    );

    vec3 ta = ro + vec3(
        cos(t * 0.4) * 0.5,
        1.2,
        -sin(t * 0.35) * 0.5
    );

    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(sin(t * 0.2), 0.0, cos(t * 0.2))));
    vec3 vv = cross(uu, ww);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + (1.2 + 0.2 * sin(audioSwell)) * ww);

    // Raymarching through Apollonian fractal space
    float totDist = 0.0;
    float minD = 1e4;
    float trap = 0.0;
    vec3 hitCol = vec3(0.0);
    float nebulaAcc = 0.0;

    for (int i = 0; i < 64; i++) {
        vec3 p = ro + rd * totDist;
        float curTrap;
        float d = mapApollonian(p, sc, curTrap);
        minD = min(minD, abs(d));

        // Volumetric nebula accumulation in the voids
        nebulaAcc += exp(-d * 8.0) * (0.015 + 0.02 * audioLevel);

        if (abs(d) < 0.002 || totDist > 12.0) {
            trap = curTrap;
            vec2 sampleUV = fract(p.xz * 0.25 + 0.5);
            vec3 texCol = img(sampleUV);
            vec3 pal = imgPalette(trap * 2.0 + t * 0.1);
            hitCol = mix(texCol, pal, 0.5) * (0.6 + 0.4 * (1.0 - d));
            break;
        }

        totDist += max(0.01, d * 0.65);
    }

    // Glowing sphere shell rims
    float edgeGlow = exp(-minD * (30.0 + 15.0 * audioCentroid)) * glw;
    vec3 glowTint = vec3(1.2, 1.0, 1.6) * edgeGlow * (1.0 + 2.5 * audioKick);

    // Volumetric cosmic nebula fog
    vec3 nebulaCol = imgPalette(0.35 + sin(t * 0.2) * 0.2) * nebulaAcc * (1.0 + audioSwell);

    vec3 finalCol = mix(nebulaCol, hitCol, clamp(length(hitCol), 0.0, 1.0));
    finalCol += glowTint + nebulaCol * 0.5;

    // Atmospheric depth fog
    float fog = 1.0 - exp(-totDist * 0.18);
    finalCol = mix(finalCol, imgPalette(0.7) * 0.3, fog);

    finalCol = pow(finalCol, vec3(0.88));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
