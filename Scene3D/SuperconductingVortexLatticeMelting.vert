#version 330 core
/**
 * @file SuperconductingVortexLatticeMelting.vert
 * @brief Vertex stage companion to SuperconductingVortexLatticeMelting.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // xyz = base coord, w = point index
in vec4 attrB; // 4 hash seeds in [0,1)

out vec3 vCol;
out float vMeltingState;
out float vPointSize;

uniform mat4 projM;
uniform float eyeOff;
uniform float time;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioChromaHue;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float latticePitchP;
uniform float pointSizeP;
uniform float pointGainP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

void main()
{
    float pIndex = attrA.w;
    vec4 seeds   = attrB;
    
    float t = time * 0.35 + audioAdvance * 0.3;
    
    // Triangular Abrikosov vortex lattice coordinates in (x,y) with z-depth
    float nx = 240.0;
    float ix = mod(pIndex, nx);
    float iy = floor(pIndex / nx);
    
    float hexOffset = mod(iy, 2.0) * 0.5;
    float spacing = (latticePitchP > 0.001 ? latticePitchP : 0.025);
    
    vec2 latticePos = vec2(
        (ix + hexOffset - nx * 0.5) * spacing * 1.7320508,
        (iy - 125.0) * spacing * 1.5
    );
    
    // Thermal vortex lattice melting into vortex liquid / vortex glass
    float thermalNoise = (sin(pIndex * 12.34 + t * 2.0) * cos(pIndex * 5.67 - t * 1.5));
    float melting = smoothstep(0.4, 0.8, sin(length(latticePos) * 2.0 - t * 0.8) * 0.5 + 0.5);
    melting *= (1.0 + 0.5 * audioSwell);
    vMeltingState = melting;
    
    // Jittered vortex liquid wandering
    vec2 jitter = vec2(seeds.x - 0.5, seeds.y - 0.5) * (melting * 0.08);
    float zCoord = (seeds.z - 0.5) * 1.2 + thermalNoise * 0.05;
    
    vec3 worldPos = vec3(latticePos + jitter, zCoord);
    
    // audioChromaHue instead of raw audioCentroid: the centroid wiggles
    // per analysis block and shifted EVERY particle's hue at once --
    // measured as COLOR_FLICKER. chromaHue is circular-slewed for hue duty.
    vCol = imgPalette(fract(pIndex * 0.0001 + melting * 0.3 + audioChromaHue));
    
    // Camera Transform (V3)
    vec3 vp = worldPos;
    vp.z += 4.5;
    vp.x -= eyeOff;
    
    // Perspective tilt
    float tilt = 0.55;
    float c = cos(tilt), s = sin(tilt);
    vp = vec3(vp.x, vp.y * c - vp.z * s, vp.y * s + vp.z * c);
    
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    
    // Point Sprite size (V8c: cap 10-18px)
    float baseSize = (pointSizeP > 1.0 ? pointSizeP : 12.0);
    gl_PointSize = clamp(baseSize * (1.7 / max(gl_Position.w * 0.25, 0.5)), 3.0, 26.8);   // sprite sweep 2026-08-22: measured luma 0.050, area x2.8
    vPointSize = gl_PointSize;
}
