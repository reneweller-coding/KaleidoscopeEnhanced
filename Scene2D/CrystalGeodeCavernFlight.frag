#version 330 core
out vec4 fragColor;
/**
 * @file CrystalGeodeCavernFlight.frag
 * @brief CRYSTAL GEODE CAVERN FLIGHT: 3D Raymarching flight through a subterranean
 * amethyst & emerald crystal geode cavern with sharp faceted prism pillars,
 * volumetric specular light beams, and glowing gemstone refractions.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous forward flight through crystal tunnels
 *   audioKick    -> flashes interior gemstone crystal nodes & specular bursts
 *   audioCentroid-> sharpens crystal facet normal reflections
 *   audioSubBass -> expands geode cavern chamber diameter
 *   audioChromaHue-> rotates the amethyst/emerald/sapphire crystal spectrum
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
uniform float crystalDensityP;
uniform float facetSharpP;
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

// Distance estimator for geode crystal cavern
float mapGeode(vec3 p, float t, float cDens, out float crystalFacet) {
    float r = length(p.xy);
    float a = atan(p.y, p.x);

    // Cavern base tunnel radius
    float cavR = 1.65 + 0.2 * sin(audioSwell * 2.0) + 0.15 * audioSubBass;
    float dTunnel = cavR - r;

    // Crystal clusters growing from cavern walls
    vec3 q = p;
    q.xy = vec2(r, a * 1.5);
    vec3 cCell = fract(q * (1.8 * cDens)) - 0.5;

    // Faceted hexagonal prism crystal SDF
    float dCrystal = length(cCell.xy) + abs(cCell.z) * 0.5 - 0.28;
    crystalFacet = dot(cCell, cCell);

    return min(dTunnel, dCrystal);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float cDens = (crystalDensityP > 0.01) ? crystalDensityP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.35 * spd;

    // Flight camera position along geode tunnel
    vec3 ro = vec3(sin(t * 0.3) * 0.4, cos(t * 0.25) * 0.4, t * 2.5);
    vec3 rd = normalize(vec3(uv, 1.25 + 0.2 * sin(audioSwell * 2.0)));

    // Raymarching
    float totDist = 0.0;
    float minD = 1e4;
    float hitFacet = 0.0;
    vec3 hitCol = vec3(0.0);

    for (int i = 0; i < 52; i++) {
        vec3 p = ro + rd * totDist;
        float curFacet;
        float d = mapGeode(p, t, cDens, curFacet);
        minD = min(minD, abs(d));

        if (abs(d) < 0.003 || totDist > 10.0) {
            hitFacet = curFacet;
            vec2 sampleUV = fract(p.xy * 0.3 + p.z * 0.2 + 0.5);
            vec3 texCol = img(sampleUV);
            vec3 palCol = imgPalette(p.z * 0.1 + hitFacet * 0.3);

            hitCol = mix(texCol, palCol, 0.55) * (0.7 + 0.4 * (1.0 - d));
            break;
        }

        totDist += max(0.015, d * 0.7);
    }

    // Glowing gemstone facets & specular sparks
    float crystalGlow = exp(-minD * (25.0 + 12.0 * audioCentroid)) * glw;
    vec3 glowTint = vec3(1.3, 1.1, 1.8) * crystalGlow * (1.0 + 2.5 * audioKick);

    vec3 bgCol = imgPalette(0.3) * 0.2;
    vec3 finalCol = mix(bgCol, hitCol, clamp(length(hitCol), 0.0, 1.0));
    finalCol += glowTint;

    // Cavern depth fog
    float fog = 1.0 - exp(-totDist * 0.18);
    finalCol = mix(finalCol, imgPalette(0.8) * 0.3, fog);

    finalCol = pow(finalCol, vec3(0.88));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
