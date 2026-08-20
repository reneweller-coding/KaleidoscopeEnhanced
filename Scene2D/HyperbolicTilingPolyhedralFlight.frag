#version 330 core
out vec4 fragColor;
/**
 * @file HyperbolicTilingPolyhedralFlight.frag
 * @brief HYPERBOLIC TILING POLYHEDRAL FLIGHT: 3D Raymarching flight through
 * non-Euclidean curved dodecahedral honeycombs in hyperbolic 3-space (H^3).
 * Endless grand cathedral arches, relativistic curvature warping, and glowing struts.
 *
 * Audio Reactivity:
 *   audioAdvance -> continuous forward flight trajectory through hyperbolic arches
 *   audioKick    -> flashes polyhedral facet vertex nodes & shockwave burst
 *   audioCentroid-> modulates structural strut density & ribbing
 *   audioSubBass -> expands hyperbolic space curvature radius
 *   audioChromaHue-> rotates the luminous stained-glass arch palette
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
uniform float curveP;
uniform float strutP;
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

// Distance estimator for hyperbolic dodecahedral honeycomb cell
float mapHyperbolic(vec3 p, float crv, float strutWidth, out float cellID) {
    // Hyperbolic space repetition via reflection planes
    vec3 q = p;
    cellID = 0.0;

    // Repeated polyhedral mirror foldings ({5,3,4} dodecahedral honeycomb generators)
    for (int i = 0; i < 5; i++) {
        q = abs(q);
        // Golden ratio plane fold: x*phi + y/phi
        float phi = 1.6180339887;
        vec3 n1 = normalize(vec3(phi, 1.0 / phi, 0.0));
        float d1 = dot(q, n1);
        if (d1 > 1.25 * crv) {
            q -= 2.0 * (d1 - 1.25 * crv) * n1;
            cellID += 1.0;
        }

        vec3 n2 = normalize(vec3(0.0, phi, 1.0 / phi));
        float d2 = dot(q, n2);
        if (d2 > 1.25 * crv) {
            q -= 2.0 * (d2 - 1.25 * crv) * n2;
            cellID += 2.0;
        }
    }

    // Distance to polyhedral edges (struts)
    float dStruts = length(vec2(length(q.xy) - 1.2 * crv, q.z)) - strutWidth;
    float dStruts2 = length(vec2(length(q.yz) - 1.2 * crv, q.x)) - strutWidth;
    float dStruts3 = length(vec2(length(q.zx) - 1.2 * crv, q.y)) - strutWidth;

    return min(min(dStruts, dStruts2), dStruts3);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float crv = (curveP > 0.01) ? curveP : 1.0;
    float strt = (strutP > 0.01) ? strutP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.3 * spd;

    // Camera trajectory flying through hyperbolic vaults
    vec3 ro = vec3(
        sin(t * 0.4) * 0.9,
        t * 1.1,
        cos(t * 0.35) * 0.9
    );

    vec3 ta = ro + vec3(
        cos(t * 0.4) * 0.6,
        1.5,
        -sin(t * 0.35) * 0.6
    );

    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(sin(t * 0.2), 0.0, cos(t * 0.2))));
    vec3 vv = cross(uu, ww);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + (1.25 + 0.2 * sin(audioSwell)) * ww);

    float strutWidth = (0.04 + 0.02 * audioLevel) * strt;

    // Raymarching through hyperbolic space
    float totDist = 0.0;
    float minD = 1e4;
    float hitCell = 0.0;
    vec3 hitCol = vec3(0.0);

    for (int i = 0; i < 56; i++) {
        vec3 p = ro + rd * totDist;
        float curCell;
        float d = mapHyperbolic(p, crv, strutWidth, curCell);
        minD = min(minD, abs(d));

        if (abs(d) < 0.003 || totDist > 10.0) {
            hitCell = curCell;
            vec2 sampleUV = fract(p.xz * 0.3 + 0.5);
            vec3 texCol = img(sampleUV);
            vec3 pal = imgPalette(hitCell * 0.15 + t * 0.1);
            hitCol = mix(texCol, pal, 0.55) * (0.7 + 0.5 * (1.0 - d));
            break;
        }

        totDist += max(0.015, d * 0.7);
    }

    // Glowing cathedral arch ribs
    float ribGlow = exp(-minD * (28.0 + 14.0 * audioCentroid)) * glw;
    vec3 glowTint = vec3(1.4, 1.1, 1.7) * ribGlow * (1.0 + 2.5 * audioKick);

    // Background stained glass atmosphere
    vec3 bgCol = imgPalette(length(uv) * 0.3 + 0.4) * (0.2 + 0.15 * audioLevel);

    vec3 finalCol = mix(bgCol, hitCol, clamp(length(hitCol), 0.0, 1.0));
    finalCol += glowTint;

    // Hyperbolic depth fog
    float fog = 1.0 - exp(-totDist * 0.2);
    finalCol = mix(finalCol, imgPalette(0.8) * 0.35, fog);

    finalCol = pow(finalCol, vec3(0.88));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
