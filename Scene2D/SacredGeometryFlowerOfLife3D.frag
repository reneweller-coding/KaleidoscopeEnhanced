#version 330 core
out vec4 fragColor;
/**
 * @file SacredGeometryFlowerOfLife3D.frag
 * @brief SACRED GEOMETRY FLOWER OF LIFE 3D: Volumetric raymarching of extruded
 * Flower of Life interlocking torus fields, Metatron's Cube hyper-lattices,
 * and kinetic multi-frequency moiré light conduits.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous 3D camera orbital flight & lattice rotation
 *   audioKick    -> flashes central merkaba core & expands toroidal radius
 *   audioCentroid-> modulates moiré interference frequency
 *   audioSubBass -> pulses sacred geometric node spheres
 *   audioChromaHue-> rotates the luminous spectral rainbow palette
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
uniform float densityP;
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

// Distance estimators for 3D Torus and Cylinder
float sdTorus(vec3 p, vec2 t) {
    vec2 q = vec2(length(p.xy) - t.x, p.z);
    return length(q) - t.y;
}

float sdSphere(vec3 p, float s) {
    return length(p) - s;
}

float mapSacred(vec3 p, float t, float rBase) {
    // Central sphere / Merkaba core
    float d = sdSphere(p, 0.35 + 0.1 * audioKick);

    // 6 outer intersecting Flower of Life circles in hexagonal arrangement
    float ringR = rBase;
    float tubeR = 0.025 + 0.01 * audioLevel;

    // Central primary torus
    d = min(d, sdTorus(p, vec2(ringR, tubeR)));

    // Hexagonal outer rings
    for (int i = 0; i < 6; i++) {
        float a = float(i) * 1.04719755; // 60 degrees
        vec3 center = vec3(cos(a), sin(a), 0.0) * ringR;
        d = min(d, sdTorus(p - center, vec2(ringR, tubeR)));

        // Spherical node at intersection
        d = min(d, sdSphere(p - center, 0.08 + 0.03 * audioSubBass));
    }

    // 3D Extrusion along Z (concentric spherical shell / merkaba struts)
    float dZ = abs(p.z) - 0.25;
    d = max(d, -dZ);

    // Diagonal Metatron connecting struts
    vec3 pRot = p;
    float cs = 0.866025, sn = 0.5;
    vec2 q = vec2(abs(p.x) * cs - p.y * sn, abs(p.x) * sn + p.y * cs);
    float strut = length(vec2(q.x, p.z)) - tubeR * 0.8;
    d = min(d, strut);

    return d;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float rBase = (radiusP > 0.01) ? radiusP : 0.85;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.25 * spd;

    // Camera ray setup with dynamic orbital tilt
    float camDist = 2.8 + 0.4 * sin(audioSwell * 2.0);
    float camAngle = t * 0.3 + audioPhase * 0.1;
    float camPitch = 0.45 + 0.2 * sin(t * 0.4);

    vec3 ro = vec3(cos(camAngle) * cos(camPitch), sin(camPitch), sin(camAngle) * cos(camPitch)) * camDist;
    vec3 ta = vec3(0.0, 0.0, 0.0);
    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + (1.3 + 0.2 * sin(audioSwell)) * ww);

    // Raymarch through Sacred Geometry field
    float totDist = 0.0;
    float minD = 1e4;
    vec3 hitCol = vec3(0.0);

    for (int i = 0; i < 56; i++) {
        vec3 p = ro + rd * totDist;

        // Apply slow dynamic inner rotation
        float csY = cos(t * 0.2), snY = sin(t * 0.2);
        p.xz = mat2(csY, -snY, snY, csY) * p.xz;

        float d = mapSacred(p, t, rBase);
        minD = min(minD, abs(d));

        if (abs(d) < 0.003 || totDist > 7.0) {
            vec2 sampleUV = fract(p.xy * 0.3 + p.z * 0.2 + 0.5);
            vec3 texCol = img(sampleUV);
            vec3 pal = imgPalette(length(p) * 0.4 + t * 0.1);
            hitCol = mix(texCol, pal, 0.5) * (0.8 + 0.5 * (1.0 - d));
            break;
        }

        totDist += max(0.015, d * 0.7);
    }

    // Volumetric glow along all sacred geometric edges
    float glow = exp(-minD * (22.0 + 12.0 * audioCentroid)) * glw;
    vec3 glowTint = vec3(1.3, 1.1, 1.6) * glow * (1.0 + 2.5 * audioKick);

    // Background moiré interference field
    float moire = sin(length(uv) * (35.0 + 20.0 * audioCentroid) - t * 3.0) *
                  cos(atan(uv.y, uv.x) * 12.0 + t);
    vec3 bgCol = imgPalette(moire * 0.2 + 0.3) * (0.2 + 0.15 * audioLevel);

    vec3 finalCol = mix(bgCol, hitCol, clamp(length(hitCol), 0.0, 1.0));
    finalCol += glowTint;

    // Center Merkaba flare
    float centerFlare = exp(-length(uv) * 4.5) * (0.8 + 1.5 * audioKick);
    finalCol += imgPalette(0.85) * centerFlare;

    finalCol = pow(finalCol, vec3(0.88));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
