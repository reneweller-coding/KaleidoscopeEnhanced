#version 330 core
out vec4 fragColor;
/**
 * @file GlitchMatrixHypercube.frag
 * @brief GLITCH MATRIX HYPERCUBE: 4D Tesseract projection intersecting 3D/2D space,
 * combined with cybernetic data moshing, digital glitch slices, ASCII/Matrix
 * data streams, chromatic aberration, and multi-planar photo texture projection.
 *   audioAdvance -> drives 4D hyper-rotations across XY/XW/YW planes
 *   audioKick    -> triggers temporal buffer slice glitches & matrix flash
 *   audioSpectrum-> modulates 4D hyper-facet tessellation depth
 *   audioHigh    -> excites high-frequency digital noise & green glyph rain
 *
 * Per-activation variety:
 *   glitchP   float digital glitch slice intensity    (0.4..2.0)
 *   rotSpdP   float 4D hyper-rotation speed           (0.5..1.8)
 *   facetP    float hypercube wireframe thickness     (0.5..2.2)
 *   hueP      float color spectrum offset             (0..6.28)
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
uniform float audioBeatPhase;

uniform float glitchP;
uniform float rotSpdP;
uniform float facetP;
uniform float hueP;
uniform float audioChromaHue;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}


// IMG-PALETTE (house standard): colours come from a rotating arc in the
// CURRENT slideshow image, so every activation inherits a fresh palette from
// the photos; the arc follows the musical key (audioChromaHue is circular-
// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

// 4D Rotation matrices
vec4 rotXW(vec4 p, float a) {
    float c = cos(a), s = sin(a);
    return vec4(p.x * c - p.w * s, p.y, p.z, p.x * s + p.w * c);
}

vec4 rotYW(vec4 p, float a) {
    float c = cos(a), s = sin(a);
    return vec4(p.x, p.y * c - p.w * s, p.z, p.y * s + p.w * c);
}

vec4 rotZW(vec4 p, float a) {
    float c = cos(a), s = sin(a);
    return vec4(p.x, p.y, p.z * c - p.w * s, p.z * s + p.w * c);
}

vec4 rotXY(vec4 p, float a) {
    float c = cos(a), s = sin(a);
    return vec4(p.x * c - p.y * s, p.x * s + p.y * c, p.z, p.w);
}

void main() {
    float glt = (glitchP > 0.0) ? glitchP : 1.0;
    float spd = (rotSpdP > 0.0) ? rotSpdP : 1.0;
    float fct = (facetP  > 0.0) ? facetP  : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    vec2 st = gl_FragCoord.xy / resolution;
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // Audio-reactive glitch slicing
    float glitchTime = floor(time * 12.0);
    float sliceSeed = hash21(vec2(floor(st.y * 24.0), glitchTime));
    float sliceActive = step(0.85 - 0.25 * audioKick, sliceSeed) * glt;
    
    vec2 glitchedUV = uv;
    vec2 glitchedST = st;
    if (sliceActive > 0.5) {
        float xShift = (hash21(vec2(sliceSeed, 1.2)) - 0.5) * 0.12 * (1.0 + audioKick * 1.5);
        glitchedUV.x += xShift;
        glitchedST.x += xShift;
    }

    // 4D Tesseract ray-geometry projection
    float t = time * 0.4 * spd + audioAdvance * 0.2;
    vec3 col = vec3(0.01, 0.02, 0.03); // Dark cyber background

    // Matrix glyph stream in background
    vec2 matrixUV = vec2(floor(glitchedST.x * 60.0) / 60.0, glitchedST.y);
    float streamSpd = 2.5 + hash21(vec2(matrixUV.x, 9.0)) * 4.0;
    float streamY = fract(matrixUV.y + time * streamSpd * 0.2);
    float glyphRand = hash21(vec2(matrixUV.x, floor(glitchedST.y * 35.0 - time * streamSpd * 7.0)));
    float charMask = step(0.4, glyphRand) * pow(1.0 - streamY, 3.0);
    vec3 matrixGlyph = vec3(0.1, 1.0, 0.4) * charMask * (0.4 + audioHigh * 0.8);
    col += matrixGlyph;

    // 16 Vertices of a 4D Unit Hypercube: (±1, ±1, ±1, ±1)
    // Project edges onto 2D screen
    vec3 wireColor = vec3(0.0);
    float minWireDist = 100.0;

    // Hypercube rotation angles
    float aXW = t * 0.7;
    float aYW = t * 0.5 + audioPhase * 0.3;
    float aZW = t * 0.9;
    float aXY = t * 0.3;

    // Camera 4D perspective distance
    float camDist4D = 2.8 + 0.5 * sin(t * 0.2) - audioSwell * 0.4;

    // Raymarch through 4D bounding hyper-planes
    for (int i = 0; i < 16; i++) {
        // Vertex in 4D space
        vec4 v4 = vec4(
            (float(i & 1) - 0.5) * 2.0,
            (float((i >> 1) & 1) - 0.5) * 2.0,
            (float((i >> 2) & 1) - 0.5) * 2.0,
            (float((i >> 3) & 1) - 0.5) * 2.0
        );

        // Apply 4D rotations
        v4 = rotXW(v4, aXW);
        v4 = rotYW(v4, aYW);
        v4 = rotZW(v4, aZW);
        v4 = rotXY(v4, aXY);

        // 4D to 3D perspective projection: P3 = V.xyz / (camDist4D - V.w)
        float wFactor = 1.0 / max(camDist4D - v4.w, 0.2);
        vec3 p3 = v4.xyz * wFactor;

        // 3D to 2D projection
        vec2 p2 = p3.xy * (1.2 / (p3.z + 2.5));

        // Connect edges: each vertex connects to 4 neighbors (bit flip in 1 dimension)
        for (int b = 0; b < 4; b++) {
            int j = i ^ (1 << b);
            if (j > i) {
                vec4 v4_b = vec4(
                    (float(j & 1) - 0.5) * 2.0,
                    (float((j >> 1) & 1) - 0.5) * 2.0,
                    (float((j >> 2) & 1) - 0.5) * 2.0,
                    (float((j >> 3) & 1) - 0.5) * 2.0
                );
                v4_b = rotXW(v4_b, aXW);
                v4_b = rotYW(v4_b, aYW);
                v4_b = rotZW(v4_b, aZW);
                v4_b = rotXY(v4_b, aXY);

                float wFactor_b = 1.0 / max(camDist4D - v4_b.w, 0.2);
                vec3 p3_b = v4_b.xyz * wFactor_b;
                vec2 p2_b = p3_b.xy * (1.2 / (p3_b.z + 2.5));

                // 2D Line segment distance from glitchedUV to line(p2, p2_b)
                vec2 pa = glitchedUV - p2;
                vec2 ba = p2_b - p2;
                float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
                float lineDist = length(pa - ba * h);

                // Laser wireframe glow
                float edgeGlow = (0.002 * fct) / (lineDist * lineDist + 0.0001);
                
                // Color by 4D depth (v4.w)
                vec3 edgeCol = imgPalette(0.30 * ((v4.w + v4_b.w) * 0.25 + 0.5)) * 1.5;
                wireColor += edgeCol * edgeGlow;
            }
        }
    }

    col += wireColor * (0.7 + audioKick * 0.8);

    // Multi-planar photo mapping with RGB chromatic aberration
    float chromOff = (0.015 + 0.02 * audioKick) * glt;
    vec3 photoR = img(clamp(glitchedST + vec2(chromOff, 0.0), 0.0, 1.0));
    vec3 photoG = img(clamp(glitchedST, 0.0, 1.0));
    vec3 photoB = img(clamp(glitchedST - vec2(chromOff, 0.0), 0.0, 1.0));
    vec3 photoAberrated = vec3(photoR.r, photoG.g, photoB.b);

    // Blend photo onto hypercube core
    float coreDist = length(glitchedUV);
    float coreMask = smoothstep(1.2, 0.2, coreDist) * (0.35 + 0.35 * audioLevel);
    col = mix(col, col + photoAberrated * 1.4, coreMask);

    // Scanlines
    float scanline = sin(gl_FragCoord.y * 1.5 + time * 5.0) * 0.06;
    col -= scanline;

    if (hue > 0.001) col = hueRot(col, hue);

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = (col) * 0.65;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
