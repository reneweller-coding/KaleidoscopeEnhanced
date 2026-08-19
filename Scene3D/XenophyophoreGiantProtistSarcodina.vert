#version 330 core
/**
 * @file XenophyophoreGiantProtistSarcodina.vert
 * @brief Vertex stage companion to XenophyophoreGiantProtistSarcodina.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // x = t [0,1], y = side (-1/+1), z = 0, w = ribbon index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out float vSide;
out float vRibbonID;
out vec3 vCol;
out float vBioPulse;

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

uniform float branchScaleP;
uniform float ribbonWidthP;

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
    float tCoord = attrA.x;
    float side   = attrA.y;
    float rIndex = attrA.w;
    
    vSide = side;
    vRibbonID = rIndex;
    vUV = vec2(tCoord, side * 0.5 + 0.5);
    
    float t = time * 0.35 + audioAdvance * 0.3;
    
    // Branching reticulopod network across abyssal sea floor
    float branchAngle = rIndex * 0.3927; // 16 radial sectors
    float branchDist = (0.2 + tCoord * 2.8) * (branchScaleP > 0.01 ? branchScaleP : 1.0);
    
    // Organic meandering of protoplasmic veins
    float meander = sin(tCoord * 12.0 + rIndex + t * 0.8) * 0.25;
    float phi = branchAngle + meander;
    
    float zFloor = sin(branchDist * 2.0 - t * 0.5) * 0.15 - 0.5;
    
    vec3 centerPos = vec3(
        cos(phi) * branchDist,
        sin(phi) * branchDist,
        zFloor
    );
    
    vec3 tangent = normalize(vec3(cos(phi), sin(phi), 0.1));
    vec3 binormal = normalize(cross(tangent, vec3(0.0, 0.0, 1.0)));
    
    // Tapering ribbon thickness from core to tips
    float taper = (1.0 - tCoord * 0.7);
    float width = (ribbonWidthP > 0.001 ? ribbonWidthP : 0.06) * taper * (1.0 + 0.3 * audioSwell);
    vec3 worldPos = centerPos + binormal * (side * width);
    
    // Bioelectric travelling wave through plasma tubes
    float pulse = exp(-abs(fract(tCoord * 3.0 - t * 1.5 + rIndex * 0.1) - 0.5) * 12.0) * (1.0 + 3.0 * audioKick);
    vBioPulse = pulse;
    
    vCol = imgPalette(fract(rIndex * 0.06 + tCoord * 0.3 + audioCentroid));
    
    // Camera Transform (V3)
    vec3 vp = worldPos;
    vp.z += 4.8;
    vp.x -= eyeOff;
    
    // Abyssal perspective tilt
    float tilt = 0.65;
    float c = cos(tilt), s = sin(tilt);
    vp = vec3(vp.x, vp.y * c - vp.z * s, vp.y * s + vp.z * c);
    
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
