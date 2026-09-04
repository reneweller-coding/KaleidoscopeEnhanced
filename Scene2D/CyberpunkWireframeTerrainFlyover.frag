#version 330 core
out vec4 fragColor;
/**
 * @file CyberpunkWireframeTerrainFlyover.frag
 * @brief CYBERPUNK WIREFRAME TERRAIN FLYOVER: fast flight over an infinite 80s
 * synthwave neon wireframe plain toward a segmented vector laser sun, stars
 * above.  (A mountain height function used to be computed here and never
 * drawn -- the plane is projected, not marched -- so the header no longer
 * promises mountains it cannot show.)
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous high-velocity forward flight across terrain
 *   audioKick    -> flashes laser sun segments & sends ground grid shockwaves
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

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float gDens = (gridDensityP > 0.01) ? gridDensityP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    // Steady base rate + musical push. audioAdvance alone barely moves on
    // quiet material -- the reported "the scene stands still, nobody flies".
    float t = time * 0.40 * spd + audioAdvance * 0.35 * spd;

    // Horizon line at y = 0.05
    float horizon = 0.05;

    vec3 finalCol = vec3(0.0);

    if (uv.y < horizon) {
        // Ground / Mountain terrain ray projection
        float dY = horizon - uv.y;
        float depth = 1.2 / max(0.02, dY);
        // Nearly three times the old ground speed: at t*4 the tiles crawled
        // (reported).  The sun and the stars keep their own slower rates.
        vec2 groundPos = vec2(uv.x * depth * 0.8, depth + t * 11.0);

        // Neon wireframe grid calculation
        vec2 grid = fract(groundPos * (0.8 * gDens)) - 0.5;
        // Bright tonal content narrows the smoothstep edge -- crisper wireframe
        // hairlines on shimmer-heavy material, soft wide bands on dark drones.
        float gridEdge = 0.08 * (1.0 - 0.35 * audioCentroid);
        float gridLine = smoothstep(gridEdge, 0.0, min(abs(grid.x), abs(grid.y)));

        // Sample distorted background photo on ground
        vec2 sampleUV = fract(groundPos * 0.1 + 0.5);
        vec3 texCol = img(sampleUV);

        // Wireframe synthwave palette
        vec3 palGround = imgPalette(groundPos.y * 0.05 + 0.1);
        vec3 baseGround = mix(texCol * 0.3, palGround * 0.4, 0.5);

        vec3 gridTint = vec3(1.6, 0.3, 1.2) * gridLine * (1.0 + 2.5 * audioKick) * glw;
        vec3 groundCol = baseGround + gridTint;

        // Depth fog towards the horizon, into the SKY colour at the line: a
        // palette grey there stood as a flat band under the sun.
        float fog = smoothstep(0.0, 0.35, dY);
        vec3 horizonCol = mix(vec3(0.15, 0.05, 0.25), imgPalette(0.8) * 0.4, 0.35);
        finalCol = mix(horizonCol, groundCol, fog);
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
            // Sky gradient with stars. The comment and the catalog's
            // "starfield sparkles" promise were both here, but no star was
            // ever drawn -- only the plain two-colour gradient below.
            float skyT = clamp((uv.y - horizon) / 0.8, 0.0, 1.0);
            vec3 skyCol = mix(vec3(0.15, 0.05, 0.25), vec3(0.02, 0.01, 0.08), skyT);

            // Static star lattice: one candidate per cell, kept sparse by the
            // hash threshold. Scrolls sideways with the flight (a fixed rate,
            // never audio-scaled), and audioCentroid sharpens each point --
            // a brighter mix resolves finer, harder sparkles. The exponent
            // rides on a 0..1 falloff so this can only narrow the star, and
            // the whole term is capped well below the sun so the sky cannot
            // wash out.
            vec2 starCell = uv * 26.0 + vec2(t * 0.35, 0.0);
            vec2 starId   = floor(starCell);
            float h = fract(sin(dot(starId, vec2(127.1, 311.7))) * 43758.5453);
            if (h > 0.90) {
                vec2  starF = fract(starCell) - 0.5;
                float sd    = 1.0 - clamp(length(starF) * 3.4, 0.0, 1.0);
                float twink = 0.55 + 0.45 * sin(audioPhase * 2.0 + h * 43.0);
                float star  = pow(sd, 6.0 + 10.0 * audioCentroid) * twink;
                // Fade the field out toward the horizon haze so stars sit in
                // the deep sky only, matching the gradient underneath them.
                skyCol += vec3(0.75, 0.80, 1.0) * min(star * skyT, 0.5);
            }
            finalCol = skyCol;
        }

        // Sun corona flare
        float sunFlare = exp(-rSun * 6.0) * (0.8 + 1.5 * audioKick);
        finalCol += vec3(1.8, 1.2, 0.6) * sunFlare;
    }

    finalCol = pow(finalCol, vec3(0.88));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
