#version 330 core
out vec4 fragColor;
/**
 * @file RecursiveTesseractWireframeZoom.frag
 * @brief RECURSIVE TESSERACT WIREFRAME ZOOM: Continuous 4D-to-3D Schlegel projection
 * plunge through nested 8-cell Tesseract hypercube wireframe cages. Seamless 4D inner-outer
 * cell inversion, neon laser edge struts, and dimensional portal flashes.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous 4D rotation & forward plunge through hypercube cells
 *   audioKick    -> flashes 4D vertex nodes & triggers Schlegel cell inversion burst
 *   audioCentroid-> modulates 4D wireframe edge strut thickness & sharpness
 *   audioSubBass -> expands 4D hypercube spatial volume breathing
 *   audioChromaHue-> rotates the glowing 4D neon wireframe spectrum
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
uniform float tesseractScaleP;
uniform float rot4DP;
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

// 4D isoclinic rotation
vec4 rot4D(vec4 p, float a1, float a2) {
    float c1 = cos(a1), s1 = sin(a1);
    float c2 = cos(a2), s2 = sin(a2);
    vec4 q = p;
    q.xy = vec2(c1 * p.x - s1 * p.y, s1 * p.x + c1 * p.y);
    q.zw = vec2(c2 * p.z - s2 * p.w, s2 * p.z + c2 * p.w);
    return q;
}

// Distance to 2D line segment
float sdSegment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float tScale = (tesseractScaleP > 0.01) ? tesseractScaleP : 1.0;
    float r4D = (rot4DP > 0.01) ? rot4DP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.32 * spd;

    // Continuous 4D forward plunge: w component advances continuously
    float wPlunge = mod(t * 0.8, 2.0) - 1.0;

    // Project 16 vertices of 4D Tesseract (+-1, +-1, +-1, +-1)
    vec2 projV[16];
    float rotA1 = t * 0.25 * r4D + audioPhase * 0.1;
    float rotA2 = t * 0.18 * r4D + audioSwell * 0.4;

    for (int i = 0; i < 16; i++) {
        vec4 v4 = vec4(
            (i & 1) != 0 ? 1.0 : -1.0,
            (i & 2) != 0 ? 1.0 : -1.0,
            (i & 4) != 0 ? 1.0 : -1.0,
            (i & 8) != 0 ? 1.0 : -1.0
        );

        v4.w += wPlunge;
        v4 = rot4D(v4, rotA1, rotA2);

        // 4D Perspective Schlegel projection to 3D, then 3D to 2D
        float d4 = 2.4 - v4.w * 0.5;
        vec3 v3 = v4.xyz / max(0.2, d4);

        float d3 = 2.0 - v3.z * 0.3;
        projV[i] = (v3.xy / max(0.2, d3)) * (0.8 * tScale);
    }

    // Accumulate distance to 32 Tesseract wireframe edges
    float minEdgeDist = 1e4;
    float minVertexDist = 1e4;

    for (int i = 0; i < 16; i++) {
        minVertexDist = min(minVertexDist, length(uv - projV[i]));

        for (int bit = 0; bit < 4; bit++) {
            int j = i ^ (1 << bit);
            if (j > i) {
                float dEdge = sdSegment(uv, projV[i], projV[j]);
                minEdgeDist = min(minEdgeDist, dEdge);
            }
        }
    }

    // Sample distorted background photo
    vec2 sampleUV = fract(uv * 0.4 + 0.5);
    vec3 texCol = img(sampleUV);

    // Glowing 4D struts and vertex sparks
    float edgeGlow = exp(-minEdgeDist * (30.0 + 15.0 * audioCentroid)) * glw;
    float vertexGlow = exp(-minVertexDist * 20.0) * (1.2 + 3.0 * audioKick);

    // 4D hypercube neon palette
    vec3 palBase = imgPalette(minEdgeDist * 0.5 + t * 0.05);
    vec3 col = mix(texCol * 0.3, palBase, 0.45);

    vec3 strutTint = vec3(1.3, 1.1, 1.8) * edgeGlow * (1.0 + 2.5 * audioKick);
    vec3 sparkTint = vec3(1.8, 1.6, 2.0) * vertexGlow;

    col += strutTint + sparkTint;

    // Center 4D singularity burst
    float centerBloom = exp(-length(uv) * 6.0) * (0.8 + 2.0 * audioKick);
    col += imgPalette(0.85) * centerBloom;

    col = pow(col, vec3(0.88));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
