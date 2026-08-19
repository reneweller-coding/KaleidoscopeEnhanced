#version 330 core
/**
 * @file SolarProminenceHelicalMagneticRope.vert
 * @brief Vertex stage companion to SolarProminenceHelicalMagneticRope.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // x = t [0,1], y = side (-1/+1), z = 0, w = ribbon index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out float vSide;
out float vRibbonID;
out vec3 vCol;
out float vFlarePulse;

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

uniform float archRadiusP;
uniform float ribbonWidthP;
uniform float ropeTwistP;

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
    
    // Solar prominence coronal magnetic flux rope arching above photosphere
    float archAngle = tCoord * 3.14159265;
    float rArch = (archRadiusP > 0.01 ? archRadiusP : 1.6);
    
    // Helical twist of magnetic flux strands around central arch axis
    float nTwist = (ropeTwistP > 0.01 ? ropeTwistP : 4.0);
    float strandAngle = tCoord * nTwist * 6.2831853 + rIndex * 0.31415927 + t * 2.0;
    float ropeR = 0.25;
    
    vec3 archPos = vec3(
        -cos(archAngle) * rArch,
        0.0,
        sin(archAngle) * (rArch * 0.8) - 0.5
    );
    
    vec3 strandOffset = vec3(
        0.0,
        cos(strandAngle) * ropeR,
        sin(strandAngle) * ropeR
    );
    
    vec3 centerPos = archPos + strandOffset;
    
    vec3 tangent = normalize(vec3(sin(archAngle) * rArch, 0.0, cos(archAngle) * (rArch * 0.8)));
    vec3 binormal = normalize(cross(tangent, vec3(0.0, 1.0, 0.0)));
    
    float width = (ribbonWidthP > 0.001 ? ribbonWidthP : 0.05) * (1.0 + 0.3 * audioSwell);
    vec3 worldPos = centerPos + binormal * (side * width);
    
    // Coronal mass ejection (CME) flare reconnection burst at apex of prominence
    float atApex = exp(-pow(tCoord - 0.5, 2.0) * 18.0);
    float pulse = atApex * (1.0 + 3.5 * audioKick);
    vFlarePulse = pulse;
    
    vCol = imgPalette(fract(rIndex * 0.166 + tCoord * 0.3 + audioCentroid));
    
    // Camera Transform (V3)
    vec3 vp = worldPos;
    
    // 3D rotation
    float c = cos(t * 0.15), s = sin(t * 0.15);
    vp = vec3(vp.x * c - vp.z * s, vp.y, vp.x * s + vp.z * c);
    vp.z += 4.5;
    vp.x -= eyeOff;
    
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
