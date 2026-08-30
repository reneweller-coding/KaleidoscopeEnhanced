#version 330 core
out vec4 fragColor;
/**
 * @file HyperDimensionalTesseractTunnel.frag
 * @brief HYPER DIMENSIONAL TESSERACT TUNNEL: 100% viewport-filling 4D hypercube
 * lattice rotating simultaneously across all 6 orthogonal Euclidean planes
 * (XY, XZ, XW, YZ, YW, ZW) and projected into a 3D perspective warp tunnel.
 * Infinite recursive interior mirror reflections, glowing neon hyper-edges,
 * multi-angle photo texturing on 4D hyper-faces, and hyperspace warp flow.
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

uniform float speedP;
uniform float rot4DP;
uniform float mirrorP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

// 4D Rotation matrix helper
vec4 rot4D(vec4 p, float a1, float a2, float a3) {
    // XW plane rotation
    float c1 = cos(a1), s1 = sin(a1);
    p.xw = vec2(p.x * c1 - p.w * s1, p.x * s1 + p.w * c1);

    // YW plane rotation
    float c2 = cos(a2), s2 = sin(a2);
    p.yw = vec2(p.y * c2 - p.w * s2, p.y * s2 + p.w * c2);

    // ZW plane rotation
    float c3 = cos(a3), s3 = sin(a3);
    p.zw = vec2(p.z * c3 - p.w * s3, p.z * s3 + p.w * c3);

    return p;
}

void main() {
    float spd = (speedP  > 0.0) ? speedP  : 1.0;
    float r4d = (rot4DP  > 0.0) ? rot4DP  : 1.0;
    float mir = (mirrorP > 0.0) ? mirrorP : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // Polar hyperspace coordinates
    float r = length(uv);
    float angle = atan(uv.y, uv.x);

    // Continuous forward hyperspace flight
    float z = (1.0 / (r + 0.08)) * (0.8 + 0.3 * audioSwell) + (time * 0.8 * spd + audioAdvance * 0.4);
    
    // Tunnel twist
    angle += sin(z * 0.4) * 0.5 + audioPhase * 0.2;

    // 4D embedding: construct a 4D position from tunnel coordinates
    vec4 p4 = vec4(
        cos(angle) * (1.2 + 0.4 * audioBass),
        sin(angle) * (1.2 + 0.4 * audioBass),
        mod(z, 4.0) - 2.0,
        sin(z * 0.8 + time * 0.5) * (1.0 + 0.5 * audioMid)
    );

    // Multi-plane 4D rotations (continuous + kick hyper-flips)
    // Weich eingeleitete Vierteldrehung statt floor()-Schnapp + Kick-Ruck --
    // beides zusammen war die gemeldete Unstetigkeit.
    float fb = time * 0.5;
    float flip = (floor(fb) + smoothstep(0.7, 1.0, fract(fb))) * 1.5707963
               + 0.15 * sin(audioPhase);
    float aXW = time * 0.3 * r4d + flip;
    float aYW = time * 0.4 * r4d + audioAdvance * 0.2;
    float aZW = time * 0.25 * r4d;
    p4 = rot4D(p4, aXW, aYW, aZW);

    // 4D Tesseract hyper-edge lattice distance
    vec4 ap4 = abs(p4);
    float max1 = max(max(ap4.x, ap4.y), max(ap4.z, ap4.w));
    float edgeDist = abs(max1 - 1.2 * mir);

    // Hyper-edge neon glow
    float hyperEdge = exp(-edgeDist * 18.0);
    float subEdge = exp(-abs(ap4.x - ap4.y) * 12.0) * exp(-abs(ap4.z - ap4.w) * 12.0);

    // Multi-angle photo texturing projected onto 4D cell faces
    vec2 cellUV1 = vec2(p4.x, p4.y) * 0.4 + 0.5;
    vec2 cellUV2 = vec2(p4.z, p4.w) * 0.4 + 0.5;
    vec2 cellUV3 = vec2(angle / 6.28318 + 0.5, fract(z * 0.2));

    vec3 photo1 = img(fract(cellUV1));
    vec3 photo2 = img(fract(cellUV2));
    vec3 photo3 = img(fract(cellUV3));
    vec3 photoMix = (photo1 + photo2 + photo3 * 1.5) * 0.45;

    // 4D depth chromatic coloring
    vec3 neonCyan = vec3(0.0, 0.9, 1.0);
    vec3 neonMagenta = vec3(1.0, 0.05, 0.6);
    vec3 neonGold = vec3(1.0, 0.8, 0.2);

    float blend4D = p4.w * 0.5 + 0.5;
    vec3 hyperColor = mix(neonCyan, neonMagenta, clamp(blend4D, 0.0, 1.0));
    hyperColor = mix(hyperColor, neonGold, hyperEdge * 0.6);

    // Viewport-filling volumetric warp tunnel shading
    vec3 col = photoMix * (0.8 + 0.6 * audioLevel);
    col += hyperColor * (hyperEdge * 2.5 + subEdge * 1.5) * (1.0 + 1.8 * audioKick);

    // Hyperspace central vanishing singularity
    float coreGlow = exp(-r * 3.5) * (0.6 + 2.0 * audioKick);
    col += vec3(1.0, 0.95, 1.0) * coreGlow;

    // Tunnel wall vignetting & depth falloff
    col *= smoothstep(0.0, 0.15, r); // Clean center transition
    col = hueRot(col, audioChromaHue + hue);
    col = pow(col, vec3(0.88)); // Contrast boost

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = (col) * 0.45;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
