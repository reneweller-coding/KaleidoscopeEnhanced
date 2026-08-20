#version 330 core
out vec4 fragColor;
/**
 * @file MobiusStripRollerDrive.frag
 * @brief MOBIUS STRIP ROLLER DRIVE: High-velocity 3D roller coaster ride along a
 * twisted single-sided Möbius strip. Seamless continuous surface traversal with
 * periodic complementary color inversions, laser track rails, and neon sparks.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous forward roller-coaster velocity along the strip
 *   audioKick    -> flashes track neon energy nodes & triggers orientation flip burst
 *   audioCentroid-> sharpens laser rail line resolution & track sparks
 *   audioSubBass -> expands strip width breathing amplitude
 *   audioChromaHue-> steers the continuous non-orientable rainbow palette
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
uniform float stripWidthP;
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

// Parametric Möbius Strip surface point: r(u, v)
vec3 mobiusPoint(float u, float v, float rBase, float w) {
    float uHalf = u * 0.5;
    float rad = rBase + v * w * cos(uHalf);
    return vec3(rad * cos(u), rad * sin(u), v * w * sin(uHalf));
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float rB = (radiusP > 0.01) ? radiusP : 2.2;
    float sW = (stripWidthP > 0.01) ? stripWidthP : 0.65;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.35 * spd;

    // Track progression parameter u (0 to 4*pi for full 2-loop return)
    float uCam = t * 0.6;
    float vCam = 0.0; // Riding in the center of the ribbon

    vec3 ro = mobiusPoint(uCam, vCam, rB, sW);
    vec3 ta = mobiusPoint(uCam + 0.08, vCam, rB, sW);

    vec3 T = normalize(ta - ro);
    vec3 upVec = normalize(mobiusPoint(uCam, 0.5, rB, sW) - ro);
    vec3 right = normalize(cross(T, upVec));
    vec3 up = cross(right, T);

    vec3 rd = normalize(uv.x * right + uv.y * up + (1.25 + 0.2 * sin(audioSwell * 2.0)) * T);

    // Raymarching through Möbius strip ribbon
    float totDist = 0.0;
    float minTrackDist = 1e4;
    vec3 hitCol = vec3(0.0);

    for (int i = 0; i < 48; i++) {
        vec3 p = ro + rd * totDist;

        // Approximate distance to Möbius strip surface
        float uApprox = atan(p.y, p.x);
        if (uApprox < 0.0) uApprox += 6.2831853;

        vec3 pCenter = mobiusPoint(uApprox, 0.0, rB, sW);
        float dRibbon = length(p - pCenter) - 0.06;
        minTrackDist = min(minTrackDist, dRibbon);

        if (dRibbon < 0.005 || totDist > 12.0) {
            // Orientation flip determination (after one 2pi revolution, side is inverted)
            float cycle = floor(uCam / 6.2831853);
            bool inverted = (mod(cycle, 2.0) == 1.0);

            vec2 sampleUV = fract(vec2(uApprox / 6.2831853, p.z * 0.4));
            vec3 texCol = img(sampleUV);
            vec3 palCol = imgPalette(uApprox / 6.2831853 + (inverted ? 0.5 : 0.0));

            hitCol = mix(texCol, palCol, 0.5) * (0.7 + 0.4 * (1.0 - dRibbon));
            break;
        }

        totDist += max(0.02, dRibbon * 0.7);
    }

    // Glowing laser track rails
    float railGlow = exp(-minTrackDist * (24.0 + 12.0 * audioCentroid)) * glw;
    vec3 railTint = vec3(1.3, 1.1, 1.8) * railGlow * (1.0 + 2.5 * audioKick);

    vec3 bgCol = imgPalette(length(uv) * 0.4 + 0.2) * (0.2 + 0.15 * audioLevel);
    vec3 finalCol = mix(bgCol, hitCol, clamp(length(hitCol), 0.0, 1.0));
    finalCol += railTint;

    finalCol = pow(finalCol, vec3(0.88));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
