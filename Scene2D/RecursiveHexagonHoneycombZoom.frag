#version 330 core
out vec4 fragColor;
/**
 * @file RecursiveHexagonHoneycombZoom.frag
 * @brief RECURSIVE HEXAGON HONEYCOMB ZOOM: Infinite logarithmic zoom dive through
 * nested hexagonal honeycomb cells. Each honeycomb gate contains rotating sub-lattices
 * that break open into glowing neon crystal walls with dimensional burst flashes.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous infinite logarithmic zoom progression
 *   audioKick    -> flashes honeycomb cell walls & triggers lattice shatter bursts
 *   audioCentroid-> modulates honeycomb rotation phase & fine wall grid resolution
 *   audioSubBass -> expands hexagonal cell diameter breathing
 *   audioChromaHue-> rotates the luminous honeycomb rainbow palette
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
uniform float wallWidthP;
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

// 2D Hexagonal grid coordinate & distance calculation
vec4 hexGrid(vec2 p) {
    vec2 s = vec2(1.0, 1.7320508);
    vec4 hC = floor(vec4(p, p - vec2(0.5, 1.0)) / vec4(s, s)) + 0.5;
    vec4 h = vec4(p - hC.xy * s, p - (hC.zw + 0.5) * s);
    return dot(h.xy, h.xy) < dot(h.zw, h.zw) ? vec4(h.xy, hC.xy) : vec4(h.zw, hC.zw + 0.5);
}

// 2D Hexagon SDF
float sdHex(vec2 p, float r) {
    const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
    p = abs(p);
    p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
    p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
    return length(p) * sign(p.y);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float scMod = (scaleP > 0.01) ? scaleP : 1.0;
    float wWidth = (wallWidthP > 0.01) ? wallWidthP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.35 * spd;

    // Logarithmic scale dive for seamless infinite honeycomb zoom
    float zoomProg = t * 0.8;
    float zoomFrac = mod(zoomProg, 1.0);

    vec3 colAcc = vec3(0.0);
    float weightAcc = 0.0;

    // Accumulate across 5 nested honeycomb octaves
    for (int k = 0; k < 5; k++) {
        float kf = float(k);
        float layerScale = exp((kf - zoomFrac) * 1.2) * (2.5 * scMod);
        float layerFade = smoothstep(0.0, 0.3, kf - zoomFrac) * smoothstep(4.5, 3.0, kf - zoomFrac);

        if (layerFade <= 0.001) continue;

        // Rotating coordinate per honeycomb level
        float rotA = t * 0.15 * (k % 2 == 0 ? 1.0 : -1.0) + kf * 0.5;
        float cs = cos(rotA), sn = sin(rotA);
        vec2 pHex = mat2(cs, -sn, sn, cs) * uv * layerScale;

        vec4 hInfo = hexGrid(pHex);
        vec2 hPos = hInfo.xy;
        vec2 hID = hInfo.zw;

        // Distance to hexagon wall
        float dWall = abs(-sdHex(hPos, 0.52)) - 0.04 * wWidth;
        float wallGlow = exp(-abs(dWall) * (25.0 / (layerScale * 0.3))) * glw;

        // Sample texture inside honeycomb cell
        vec2 sampleUV = fract(hPos * 0.4 + 0.5);
        vec3 texCol = img(sampleUV);
        vec3 palCol = imgPalette(sin(dot(hID, vec2(12.3, 45.6))) * 0.5 + 0.5);

        vec3 cellCol = mix(texCol, palCol, 0.5);
        cellCol += vec3(1.3, 1.1, 1.8) * wallGlow * (1.0 + 2.5 * audioKick);

        colAcc += cellCol * layerFade;
        weightAcc += layerFade;
    }

    vec3 finalCol = colAcc / max(0.001, weightAcc);

    // Center portal burst
    float portalPulse = pow(max(0.0, 1.0 - abs(zoomFrac - 0.5) * 4.0), 3.0) * (0.5 + 1.2 * audioKick);
    finalCol += imgPalette(0.85) * portalPulse;

    finalCol = pow(finalCol, vec3(0.88));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
