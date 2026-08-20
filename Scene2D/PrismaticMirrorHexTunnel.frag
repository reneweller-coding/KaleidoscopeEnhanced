#version 330 core
out vec4 fragColor;
/**
 * @file PrismaticMirrorHexTunnel.frag
 * @brief PRISMATIC MIRROR HEX TUNNEL: 3D Hexagonal infinity mirror tunnel with
 * recursive multi-bounce reflections, chromatic dispersion spectral fringe,
 * dynamic iris aperture contractions, and high-energy laser strut pulses.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous forward flight progression through the hex tunnel
 *   audioKick    -> flashes interior laser nodes & iris aperture contraction burst
 *   audioCentroid-> sharpens reflection dispersion fringe
 *   audioSubBass -> expands hexagonal tunnel radius breathing
 *   audioChromaHue-> rotates the prismatic mirror reflection spectrum
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
uniform float radiusP;
uniform float bounceP;
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

// 2D Hexagonal SDF
float sdHexagon(vec2 p, float r) {
    const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
    p = abs(p);
    p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
    p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
    return length(p) * sign(p.y);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float rHex = (radiusP > 0.01) ? radiusP : 1.35;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.35 * spd;

    // Flight camera position in center of hex tunnel
    vec3 ro = vec3(0.0, 0.0, t * 2.5);
    vec3 rd = normalize(vec3(uv, 1.25 + 0.2 * sin(audioSwell * 2.0)));

    // Hexagonal mirror tunnel radius with audio breathing
    float hexRadius = rHex * (1.0 + 0.15 * sin(audioSwell * 2.5) + 0.1 * audioSubBass);

    vec3 colAcc = vec3(0.0);
    vec3 rayColor = vec3(1.0);
    vec3 p = ro;
    float minStrutDist = 1e4;

    // Multi-bounce mirror reflection loop (up to 4 reflections)
    for (int bounce = 0; bounce < 4; bounce++) {
        float tHit = 0.0;

        // March to find hex tunnel wall intersection
        for (int i = 0; i < 28; i++) {
            vec3 pCur = p + rd * tHit;
            // Twist along Z
            float rotZ = pCur.z * 0.15 + t * 0.1;
            float cs = cos(rotZ), sn = sin(rotZ);
            vec2 pRot = mat2(cs, -sn, sn, cs) * pCur.xy;

            float d = -sdHexagon(pRot, hexRadius);
            minStrutDist = min(minStrutDist, abs(d));

            if (d < 0.003 || tHit > 8.0) break;
            tHit += max(0.02, d * 0.7);
        }

        p += rd * tHit;

        // Compute normal of hexagonal wall
        float rotZ = p.z * 0.15 + t * 0.1;
        float cs = cos(rotZ), sn = sin(rotZ);
        vec2 pRot = mat2(cs, -sn, sn, cs) * p.xy;

        float eps = 0.005;
        float dC = sdHexagon(pRot, hexRadius);
        float dX = sdHexagon(pRot + vec2(eps, 0.0), hexRadius);
        float dY = sdHexagon(pRot + vec2(0.0, eps), hexRadius);
        vec2 n2D = normalize(vec2(dX - dC, dY - dC));
        vec3 n3D = vec3(mat2(cs, sn, -sn, cs) * n2D, 0.0);

        // Sample texture on wall face
        vec2 sampleUV = fract(vec2(atan(pRot.y, pRot.x) / 6.2831853 + 0.5, p.z * 0.15));
        vec3 texCol = img(sampleUV);
        vec3 palCol = imgPalette(float(bounce) * 0.25 + p.z * 0.05);

        vec3 wallCol = mix(texCol, palCol, 0.5);

        // Add to accumulated color with reflection attenuation
        colAcc += wallCol * rayColor * 0.45;

        // Prismatic dispersion on bounce (R, G, B reflections deviate slightly)
        rayColor *= vec3(0.85, 0.88, 0.92);

        // Reflect ray
        rd = reflect(rd, -n3D);
        p += rd * 0.03; // Step away from wall
    }

    // Glowing laser strut lines along hexagon vertices
    float strutGlow = exp(-minStrutDist * (28.0 + 14.0 * audioCentroid)) * glw;
    vec3 strutTint = vec3(1.3, 1.1, 1.8) * strutGlow * (1.0 + 3.0 * audioKick);

    colAcc += strutTint;

    colAcc = pow(colAcc, vec3(0.88));
    fragColor = vec4(clamp(colAcc, 0.0, 1.0), 1.0);
}
