#version 330 core
out vec4 fragColor;
/**
 * @file ApollonianSpherePackingDive.frag
 * @brief APOLLONIAN SPHERE PACKING DIVE: 3D Raymarching continuous dive into the voids
 * of an Apollonian sphere packing (mutually tangent Soddy spheres). Endless recursive
 * sphere inversions, glowing circular contact laser rings, and infinite depth reflection.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous forward dive into tangent sphere voids
 *   audioKick    -> flashes sphere contact tangency nodes & triggers inversion burst
 *   audioCentroid-> sharpens spherical laser contact ring contours
 *   audioSubBass -> expands Soddy sphere radii breathing
 *   audioChromaHue-> rotates the luminous Apollonian gemstone spectrum
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
uniform float foldP;
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

// Apollonian 3D sphere packing distance estimator
float mapApollonian(vec3 p, float t, out float trapLevel) {
    vec3 q = p;
    float scale = 1.0;
    trapLevel = 0.0;

    for (int i = 0; i < 6; i++) {
        // Periodic box wrapping
        q = mod(q - 1.0, 2.0) - 1.0;

        // Spherical inversion, Mandelbox-style piecewise clamp: only points
        // that land INSIDE the fixed radius get inverted/scaled, capped by
        // the min-radius ratio. The original unconditional k=1.25/max(0.2,r2)
        // multiplied q on every iteration regardless of r2, so an unlucky run
        // of small-r2 iterations could compound `scale` by up to 6.25^6 --
        // crushing the returned distance to a few millionths and making the
        // raymarcher report a "hit" one step off the camera for nearly every
        // ray, which read as a flat, structureless wash filling the frame.
        float r2 = dot(q, q);
        const float minR2 = 0.3, fixedR2 = 1.0;
        if (r2 < minR2) {
            float k = fixedR2 / minR2;
            q *= k;
            scale *= k;
        } else if (r2 < fixedR2) {
            float k = fixedR2 / r2;
            q *= k;
            scale *= k;
        }

        trapLevel += r2 * 0.15;
    }

    // Distance to inner sphere surface
    float dSphere = (length(q) - 0.75) / scale;
    return dSphere * 0.7;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float sc = (scaleP > 0.01) ? scaleP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.28 * spd;

    // Continuous dive trajectory through sphere gaps
    float diveProg = t * 0.6;
    vec3 ro = vec3(sin(diveProg * 0.3) * 0.4, cos(diveProg * 0.25) * 0.4, diveProg * 1.5) * sc;
    vec3 rd = normalize(vec3(uv, 1.25 + 0.2 * sin(audioSwell * 2.0)));

    // Raymarching through Apollonian sphere packing
    float totDist = 0.0;
    float minD = 1e4;
    float hitTrap = 0.0;
    vec3 hitCol = vec3(0.0);

    for (int i = 0; i < 52; i++) {
        vec3 p = ro + rd * totDist;
        float curTrap;
        float d = mapApollonian(p, t, curTrap);
        minD = min(minD, abs(d));

        if (abs(d) < 0.003 || totDist > 8.0) {
            hitTrap = curTrap;
            vec2 sampleUV = fract(p.xy * 0.3 + p.z * 0.2 + 0.5);
            vec3 texCol = img(sampleUV);
            vec3 palCol = imgPalette(hitTrap * 0.25 + t * 0.05);

            hitCol = mix(texCol, palCol, 0.5) * (0.7 + 0.4 * (1.0 - d));
            break;
        }

        totDist += max(0.015, d * 0.7);
    }

    // Glowing spherical tangency contact rings
    float contactGlow = exp(-minD * (26.0 + 12.0 * audioCentroid)) * glw;
    vec3 glowTint = vec3(1.3, 1.1, 1.8) * contactGlow * (1.0 + 2.5 * audioKick);

    vec3 bgCol = imgPalette(length(uv) * 0.4 + 0.2) * (0.2 + 0.15 * audioLevel);
    vec3 finalCol = mix(bgCol, hitCol, clamp(length(hitCol), 0.0, 1.0));
    finalCol += glowTint;

    finalCol = pow(finalCol, vec3(0.88));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
