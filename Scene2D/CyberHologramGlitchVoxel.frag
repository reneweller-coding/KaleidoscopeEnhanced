#version 330 core
out vec4 fragColor;
// CyberHologramGlitchVoxel.frag
// -----------------------------------------------------------------------
// CYBER HOLOGRAM GLITCH VOXEL: 100% viewport-filling volumetric 3D laser
// holographic scan. The 2D photo is converted into a floating 3D voxel
// pointcloud via luminance depth extrusion, with scanning laser sheets,
// chromatic optical aberration, CRT scanlines, and audio data-mosh glitches.
// -----------------------------------------------------------------------

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

uniform float depthP;
uniform float glitchP;
uniform float speedP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
}

void main() {
    float dpt = (depthP  > 0.0) ? depthP  : 1.0;
    float glt = (glitchP > 0.0) ? glitchP : 1.0;
    float spd = (speedP  > 0.0) ? speedP  : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.3 * spd + audioAdvance * 0.2;

    // Digital glitch / data-mosh horizontal slice shift
    float sliceBlock = floor(gl_FragCoord.y / 16.0);
    float sliceHash = hash21(vec2(sliceBlock, floor(time * 6.0)));
    float glitchShift = (sliceHash - 0.5) * 0.08 * step(0.82, sliceHash) * (1.0 + 3.0 * audioKick) * glt;

    vec2 scanUV = uv + vec2(glitchShift, 0.0);

    // 3D Parallax camera rotation around hologram
    float camYaw = sin(t * 0.4) * 0.35;
    float camPitch = cos(t * 0.3) * 0.25;
    scanUV = vec2(
        scanUV.x * cos(camYaw) - scanUV.y * sin(camYaw),
        scanUV.x * sin(camYaw) + scanUV.y * cos(camYaw)
    );

    // Sample photo with chromatic aberration
    vec2 photoCenter = scanUV * 0.65 + vec2(0.5);
    float dispAmt = (0.01 + 0.02 * audioKick) * glt;

    vec3 photoR = img(fract(photoCenter + vec2(dispAmt, 0.0)));
    vec3 photoG = img(fract(photoCenter));
    vec3 photoB = img(fract(photoCenter - vec2(dispAmt, 0.0)));
    vec3 photoBase = vec3(photoR.r, photoG.g, photoB.b);

    // Depth extrusion from luminance
    float lum = dot(photoBase, vec3(0.299, 0.587, 0.114));
    float hologramDepth = (lum * 1.8 + 0.6 * audioBass) * dpt;

    // Volumetric 3D laser scan beam sweep
    float scanPos = mod(time * 0.6, 1.4) - 0.7;
    float laserBeam = exp(-abs(scanUV.y - scanPos) * 35.0) * (1.5 + 2.5 * audioHigh);

    // CRT hologram scanlines & dot matrix
    float scanline = sin(gl_FragCoord.y * 1.5) * 0.25 + 0.75;
    float dotMatrix = sin(gl_FragCoord.x * 1.2) * sin(gl_FragCoord.y * 1.2) * 0.2 + 0.8;

    // Holographic quantum interference emitter rings
    float emitterR = length(scanUV);
    float emitterRing = sin(emitterR * 40.0 - time * 12.0) * 0.5 + 0.5;
    emitterRing = pow(emitterRing, 6.0) * 0.6;

    // Cyberpunk hologram colors: Cyan / Blue with Neon Orange Laser Highlights
    vec3 holoCyan = vec3(0.0, 0.85, 1.0);
    vec3 holoOrange = vec3(1.0, 0.45, 0.1);
    vec3 holoViolet = vec3(0.7, 0.15, 1.0);

    vec3 holoColor = mix(holoCyan, holoViolet, lum);
    holoColor = mix(holoColor, holoOrange, laserBeam);

    vec3 col = photoBase * holoColor * (1.2 + hologramDepth * 0.5) * scanline * dotMatrix;
    col += holoOrange * laserBeam * 2.0;
    col += holoCyan * emitterRing * (0.8 + 1.2 * audioMid);

    // Background cyber grid floor reflection
    if (uv.y < -0.2) {
        float floorZ = 1.0 / abs(uv.y + 0.2);
        vec2 floorUV = vec2(uv.x * floorZ * 0.5, floorZ + t * 2.0);
        vec2 fGrid = abs(fract(floorUV) - 0.5);
        float gridLine = smoothstep(0.48, 0.50, max(fGrid.x, fGrid.y));
        col += holoCyan * gridLine * exp(-floorZ * 0.2) * 0.6;
    }

    col = hueRot(col, audioChromaHue + hue);
    col = pow(col, vec3(0.88));

    fragColor = vec4(col, 1.0);
}
