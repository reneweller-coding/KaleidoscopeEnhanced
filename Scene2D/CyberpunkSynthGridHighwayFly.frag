#version 330 core
out vec4 fragColor;
/**
 * @file CyberpunkSynthGridHighwayFly.frag
 * @brief CYBERPUNK SYNTH GRID HIGHWAY FLY: High-velocity 3D flight across an
 * endless neon wireframe synthesizer highway with audio-reactive mountain equalizers,
 * a giant segmented laser horizon sun, and gleaming digital data streams.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives high-speed highway flight progression
 *   audioKick    -> flashes sun horizon flares & highway laser pulse
 *   audioBass/SubBass -> elevates mountain equalizer peaks
 *   audioCentroid-> sharpens wireframe neon grid anti-aliasing
 *   audioChromaHue-> rotates the retrowave magenta/cyan/sunset palette
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
uniform float heightP;
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

// Procedural mountain height function reacting to audio bass
float terrainHeight(vec2 p, float t, float hMult) {
    float h = 0.0;
    // Flat highway in center: |p.x| < 1.0
    float highwayMask = smoothstep(0.8, 2.5, abs(p.x));

    // Mountain ridges on sides
    float n1 = sin(p.x * 0.8 + t * 0.2) * cos(p.y * 0.6);
    float n2 = sin(p.x * 1.6 - p.y * 1.2) * 0.5;
    float n3 = abs(sin(p.x * 3.2 + p.y * 2.5)) * 0.25;

    h = (n1 + n2 + n3) * (1.2 + 1.5 * audioBass) * hMult * highwayMask;
    return h;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float hM = (heightP > 0.01) ? heightP : 1.0;
    float gDens = (gridDensityP > 0.01) ? gridDensityP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    // Steady base rate + musical push. audioAdvance alone barely moves on
    // quiet material -- the reported "the scene stands still, nobody flies".
    float t = time * 0.40 * spd + audioAdvance * 0.35 * spd;

    // Camera setup: low hovering perspective above cyber highway
    vec3 ro = vec3(sin(t * 0.3) * 0.4, 0.8 + 0.2 * sin(audioSwell * 2.0), t * 4.0);
    vec3 rd = normalize(vec3(uv.x, uv.y - 0.15, 1.2));

    vec3 col = vec3(0.0);

    // Horizon sun and sky rendering (if looking up)
    if (rd.y > 0.0) {
        // Giant synth sun on horizon
        vec2 sunUV = uv - vec2(0.0, 0.05);
        float dSun = length(sunUV);

        if (dSun < 0.45) {
            // Horizontal laser blinds scanlines in sun
            float scanlines = cos(sunUV.y * 60.0 - t * 4.0);
            float sunMask = smoothstep(0.45, 0.43, dSun) * step(0.0, scanlines + (sunUV.y + 0.2) * 2.0);

            // Sun color gradient (yellow to hot magenta)
            vec3 sunCol = mix(vec3(1.5, 1.2, 0.2), vec3(1.8, 0.2, 0.9), clamp((sunUV.y + 0.4) / 0.8, 0.0, 1.0));
            col += sunCol * sunMask * (1.0 + 1.5 * audioKick);
        }

        // Sky synth grid
        float skyGrid = abs(sin(rd.x * 20.0 / max(0.05, rd.y))) * abs(sin(1.0 / max(0.05, rd.y) * 8.0 - t * 2.0));
        col += imgPalette(0.8) * smoothstep(0.9, 1.0, skyGrid) * 0.25 * audioHigh;

        // Sky gradient
        col += mix(imgPalette(0.3) * 0.2, imgPalette(0.75) * 0.6, clamp(rd.y * 2.0, 0.0, 1.0));
    }

    // Terrain ground plane raymarching (if looking down)
    if (rd.y < 0.0) {
        float tGround = 0.0;
        vec3 pGround = ro;

        for (int i = 0; i < 48; i++) {
            pGround = ro + rd * tGround;
            float h = terrainHeight(pGround.xz, t, hM);
            float d = pGround.y - h;

            if (d < 0.01 || tGround > 30.0) break;
            tGround += max(0.04, d * 0.6);
        }

        // Compute neon wireframe grid lines on terrain
        vec2 gridCoord = pGround.xz * (2.0 * gDens);
        vec2 gridFract = abs(fract(gridCoord - 0.5) - 0.5);
        // Bright tonal content pulls the smoothstep edge in, so the neon grid
        // resolves to hard hairlines instead of soft fat bands.
        float lineWidth = 0.06 * (1.0 - 0.35 * audioCentroid) * (1.0 + 0.05 * tGround);
        float lineDist = min(gridFract.x, gridFract.y);
        float gridLine = smoothstep(lineWidth, 0.0, lineDist);

        // Highway center laser stripes
        float centerStripe = smoothstep(0.08, 0.0, abs(pGround.x)) *
                             smoothstep(0.3, 0.0, abs(fract(pGround.z * 0.5 - t * 2.0) - 0.5));

        // Sample texture on terrain
        vec2 sampleUV = fract(pGround.xz * 0.1);
        vec3 texCol = img(sampleUV);

        // Cyber grid colors (cyan wireframe, magenta terrain, gold stripes)
        vec3 terrainBase = imgPalette(pGround.y * 0.3 + 0.1) * 0.3;
        vec3 wireCol = vec3(0.2, 1.4, 1.8) * (1.0 + 2.0 * audioKick) * glw;
        vec3 stripeCol = vec3(1.8, 1.4, 0.2) * (1.5 + 3.0 * audioKick);

        vec3 groundCol = mix(terrainBase, texCol, 0.3);
        groundCol += wireCol * gridLine;
        groundCol += stripeCol * centerStripe;

        // Depth fog on terrain
        float depthFog = 1.0 - exp(-tGround * 0.08);
        groundCol = mix(groundCol, imgPalette(0.7) * 0.5, depthFog);

        col = groundCol;
    }

    col = pow(col, vec3(0.88));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
