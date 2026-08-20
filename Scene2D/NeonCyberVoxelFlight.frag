#version 330 core
out vec4 fragColor;
/**
 * @file NeonCyberVoxelFlight.frag
 * @brief NEON CYBER VOXEL FLIGHT: High-speed 3D low-altitude flight through an
 * endless cyberpunk voxel megalopolis with audio-reactive skyscraper heights,
 * glowing matrix window grids, holographic sky billboards, and laser searchlights.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous forward flight between voxel towers
 *   audioKick    -> flashes skyscraper neon roof beacons & billboard shockwaves
 *   audioBass    -> elevates skyscraper equalizer heights
 *   audioCentroid-> sharpens window voxel grid anti-aliasing
 *   audioChromaHue-> rotates the cyberpunk neon cyan/magenta/amber palette
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
uniform float cityDensityP;
uniform float heightP;
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

// Procedural skyscraper building height function
float buildingHeight(vec2 cellID, float hMod) {
    float n = sin(cellID.x * 12.9898 + cellID.y * 78.233);
    float randH = fract(sin(n) * 43758.5453);
    return (0.8 + 2.5 * randH) * (1.0 + 1.2 * audioBass) * hMod;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float cDens = (cityDensityP > 0.01) ? cityDensityP : 1.0;
    float hMod = (heightP > 0.01) ? heightP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.42 * spd;

    // Flight camera weaving between city skyscrapers
    vec3 ro = vec3(sin(t * 0.3) * 1.5, 1.8 + 0.3 * sin(audioSwell * 2.0), t * 3.5);
    vec3 rd = normalize(vec3(uv.x, uv.y - 0.1, 1.25));

    // Raymarching through voxel city
    float totDist = 0.0;
    vec3 hitCol = vec3(0.0);
    vec3 hitPos = vec3(0.0);
    bool hitBuilding = false;

    for (int i = 0; i < 54; i++) {
        vec3 p = ro + rd * totDist;
        vec2 cellID = floor(p.xz * (0.5 * cDens));
        vec2 cellUV = fract(p.xz * (0.5 * cDens)) - 0.5;

        float h = buildingHeight(cellID, hMod);

        // Distance to box tower: |x| < 0.35, |z| < 0.35, y < h
        vec2 dBox2D = abs(cellUV) - vec2(0.35);
        float dWall = max(dBox2D.x, dBox2D.y);
        float dRoof = p.y - h;

        float d = max(dWall, dRoof);

        if (d < 0.01 || totDist > 25.0) {
            if (totDist <= 25.0) {
                hitBuilding = true;
                hitPos = p;
            }
            break;
        }

        totDist += max(0.03, d * 0.65);
    }

    if (hitBuilding) {
        // Compute glowing window grid on building facade
        vec2 winGrid = fract(hitPos.xy * vec2(8.0, 4.0)) - 0.5;
        float winDist = max(abs(winGrid.x), abs(winGrid.y));
        // Tonal brightness crisps the window edges: raising the inner stop
        // narrows the smoothstep band, so bright material gives hard-edged
        // voxel windows and dark material leaves them soft/blurred.
        float winMask = smoothstep(0.4, 0.25 + 0.11 * audioCentroid, winDist);

        // Random window light on/off pattern
        float winRand = fract(sin(dot(floor(hitPos.xy * vec2(8.0, 4.0)), vec2(12.3, 45.6))) * 43758.5453);
        float isLit = step(0.45, winRand);

        // Sample texture on facade
        vec2 sampleUV = fract(hitPos.xz * 0.2 + hitPos.y * 0.1);
        vec3 texCol = img(sampleUV);
        vec3 palCol = imgPalette(hitPos.y * 0.2 + 0.1);

        vec3 bldgBase = mix(texCol, palCol, 0.3) * 0.4;
        vec3 winCol = vec3(1.5, 1.3, 0.4) * winMask * isLit * (1.0 + 2.0 * audioKick) * glw;

        hitCol = bldgBase + winCol;

        // Rooftop laser beacons
        float roofBeacon = smoothstep(0.1, 0.0, abs(hitPos.y - buildingHeight(floor(hitPos.xz * (0.5 * cDens)), hMod)));
        hitCol += vec3(1.8, 0.3, 0.9) * roofBeacon * (1.0 + 2.5 * audioKick);
    } else {
        // Sky with cyberpunk laser grid
        float skyGrid = abs(sin(rd.x * 25.0 / max(0.05, rd.y + 0.2))) * abs(cos(1.0 / max(0.05, rd.y + 0.2) * 10.0 - t * 2.0));
        hitCol = imgPalette(0.8) * smoothstep(0.88, 1.0, skyGrid) * 0.3 * audioHigh;
        hitCol += mix(imgPalette(0.2) * 0.15, imgPalette(0.7) * 0.5, clamp(rd.y + 0.2, 0.0, 1.0));
    }

    // Atmospheric depth haze
    float depthFog = 1.0 - exp(-totDist * 0.08);
    hitCol = mix(hitCol, imgPalette(0.75) * 0.4, depthFog);

    hitCol = pow(hitCol, vec3(0.88));
    fragColor = vec4(clamp(hitCol, 0.0, 1.0), 1.0);
}
