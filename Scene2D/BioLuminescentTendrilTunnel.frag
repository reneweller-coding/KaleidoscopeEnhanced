#version 330 core
out vec4 fragColor;
/**
 * @file BioLuminescentTendrilTunnel.frag
 * @brief BIO LUMINESCENT TENDRIL TUNNEL: 3D Raymarching dive through an organic
 * deep-sea tunnel lined with swaying bioluminescent siphonophore tentacles,
 * luminous synaptic nerve pulses, and glowing volumetric plankton clouds.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous forward swim trajectory through the abyss
 *   audioKick    -> flashes intense cyan/magenta tentacle bioluminescence pulses
 *   audioCentroid-> modulates tendril harmonic wave frequency & fine cilia
 *   audioSubBass -> expands tunnel respiration breathing
 *   audioChromaHue-> steers the deep-sea fluorescent spectrum
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
uniform float tendrilCountP;
uniform float swayP;
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

// Distance estimator for swaying organic tendril tunnel
float mapTendrilTunnel(vec3 p, float t, float sway, out float pulseVal) {
    float r = length(p.xy);
    float a = atan(p.y, p.x);

    // Tunnel wall baseline radius
    float tunnelR = 1.45 + 0.2 * sin(audioSwell * 2.0) + 0.15 * audioSubBass;

    // Swaying tendril displacement around perimeter
    float nTendrils = 8.0;
    float seg = 6.2831853 / nTendrils;
    float aLocal = mod(a + seg * 0.5, seg) - seg * 0.5;

    // Organic sinusoidal undulation along length Z
    float waveZ = sin(p.z * 1.5 - t * 2.5 + a * 2.0) * (0.25 * sway);
    float waveRadial = sin(a * nTendrils + p.z * 2.0 - t * 3.0) * 0.18;

    // Tendril strand surface distance
    float dWall = abs(r - (tunnelR + waveZ + waveRadial)) - 0.04;

    // Nerve impulse pulse propagating along tendril fibers
    pulseVal = sin(p.z * 3.0 - t * 6.0 + a * 4.0);

    return dWall;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float swy = (swayP > 0.01) ? swayP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.35 * spd;

    // Camera path swimming along winding organic tunnel
    vec3 ro = vec3(sin(t * 0.4) * 0.3, cos(t * 0.3) * 0.3, t * 2.0);
    vec3 ta = ro + vec3(sin(t * 0.4 + 0.2) * 0.4, cos(t * 0.3 + 0.2) * 0.4, 2.0);

    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + (1.2 + 0.2 * sin(audioSwell)) * ww);

    // Raymarching through tendril tunnel
    float totDist = 0.0;
    float minD = 1e4;
    float pulseHit = 0.0;
    vec3 hitCol = vec3(0.0);
    float bioPlankton = 0.0;

    for (int i = 0; i < 52; i++) {
        vec3 p = ro + rd * totDist;
        float curPulse;
        float d = mapTendrilTunnel(p, t, swy, curPulse);
        minD = min(minD, abs(d));

        bioPlankton += exp(-d * 6.0) * (0.015 + 0.02 * audioLevel);

        if (abs(d) < 0.003 || totDist > 12.0) {
            pulseHit = curPulse;
            vec2 sampleUV = fract(vec2(atan(p.y, p.x) / 6.2831853 + 0.5, p.z * 0.2));
            vec3 texCol = img(sampleUV);
            vec3 palCol = imgPalette(p.z * 0.15 + t * 0.05);
            hitCol = mix(texCol, palCol, 0.5) * (0.6 + 0.4 * (1.0 - d));
            break;
        }

        totDist += max(0.02, d * 0.7);
    }

    // Glowing nerve pulses traveling along tendrils
    float nervePulse = smoothstep(0.7, 1.0, pulseHit) * (1.0 + 3.0 * audioKick);
    float edgeGlow = exp(-minD * (25.0 + 12.0 * audioCentroid)) * glw;

    vec3 biolumTint = vec3(0.2, 1.4, 1.7) * (edgeGlow + nervePulse * 1.2) * (1.0 + 2.0 * audioKick);
    vec3 planktonCol = imgPalette(0.4) * bioPlankton * (0.8 + 1.2 * audioSwell);

    vec3 finalCol = mix(planktonCol, hitCol, clamp(length(hitCol), 0.0, 1.0));
    finalCol += biolumTint + planktonCol * 0.4;

    // Abyss depth water fog
    float fog = 1.0 - exp(-totDist * 0.15);
    finalCol = mix(finalCol, imgPalette(0.8) * 0.25, fog);

    finalCol = pow(finalCol, vec3(0.87));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
