#version 330 core
out vec4 fragColor;
/**
 * @file CyberpunkWireframeTerrainFlyover.frag
 * @brief CYBERPUNK WIREFRAME TERRAIN FLYOVER: Mach 3 flight over an infinite 80s synthwave
 * neon wireframe mountain landscape with reflective chrome water valleys, segmented
 * vector laser sun on the horizon, and audio-reactive mountain equalizer peaks.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous high-velocity forward flight across terrain
 *   audioKick    -> flashes laser sun segments & sends ground grid shockwaves
 *   audioBass    -> elevates mountain wireframe terrain height peaks
 *   audioCentroid-> sharpens wireframe anti-aliasing & starfield sparkles
 *   audioChromaHue-> rotates the synthwave neon magenta/cyan/orange palette
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
uniform float terrainHeightP;
uniform float gridDensityP;
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

// Procedural mountain terrain height function
float terrainH(vec2 p, float hMod) {
    float n = sin(p.x * 0.5) * cos(p.y * 0.4) + sin(p.x * 1.2 + p.y * 0.8) * 0.5;
    // Central canyon for smooth road
    float canyon = smoothstep(0.5, 2.0, abs(p.x));
    return max(0.0, n * 1.6 * canyon) * (1.0 + 1.2 * audioBass) * hMod;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float tH = (terrainHeightP > 0.01) ? terrainHeightP : 1.0;
    float gDens = (gridDensityP > 0.01) ? gridDensityP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.45 * spd;

    // Horizon line at y = 0.05
    float horizon = 0.05;

    vec3 finalCol = vec3(0.0);

    if (uv.y < horizon) {
        // Ground / Mountain terrain ray projection
        float dY = horizon - uv.y;
        float depth = 1.2 / max(0.02, dY);
        vec2 groundPos = vec2(uv.x * depth * 0.8, depth + t * 4.0);

        float h = terrainH(groundPos, tH);

        // Neon wireframe grid calculation
        vec2 grid = fract(groundPos * (0.8 * gDens)) - 0.5;
        float gridLine = smoothstep(0.08, 0.0, min(abs(grid.x), abs(grid.y)));

        // Sample distorted background photo on ground
        vec2 sampleUV = fract(groundPos * 0.1 + 0.5);
        vec3 texCol = img(sampleUV);

        // Wireframe synthwave palette
        vec3 palGround = imgPalette(groundPos.y * 0.05 + 0.1);
        vec3 baseGround = mix(texCol * 0.3, palGround * 0.4, 0.5);

        vec3 gridTint = vec3(1.6, 0.3, 1.2) * gridLine * (1.0 + 2.5 * audioKick) * glw;
        vec3 groundCol = baseGround + gridTint;

        // Depth fog towards horizon
        float fog = smoothstep(0.0, 0.35, dY);
        finalCol = mix(imgPalette(0.8) * 0.4, groundCol, fog);
    } else {
        // Sky with segmented synthwave laser sun
        vec2 sunUV = uv - vec2(0.0, horizon + 0.25);
        float rSun = length(sunUV);

        if (rSun < 0.28) {
            // Horizontal blind segments across sun
            float segment = sin(sunUV.y * 45.0);
            float sunMask = smoothstep(-0.2, 0.5, segment);

            // Sun gradient (yellow top to magenta bottom)
            vec3 sunCol = mix(vec3(1.9, 0.2, 0.8), vec3(1.9, 1.6, 0.2), clamp(sunUV.y / 0.28 + 0.5, 0.0, 1.0));
            finalCol = sunCol * sunMask * (1.2 + 1.8 * audioKick);
        } else {
            // Sky gradient with stars
            float skyT = clamp((uv.y - horizon) / 0.8, 0.0, 1.0);
            vec3 skyCol = mix(vec3(0.15, 0.05, 0.25), vec3(0.02, 0.01, 0.08), skyT);
            finalCol = skyCol;
        }

        // Sun corona flare
        float sunFlare = exp(-rSun * 6.0) * (0.8 + 1.5 * audioKick);
        finalCol += vec3(1.8, 1.2, 0.6) * sunFlare;
    }

    finalCol = pow(finalCol, vec3(0.88));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
