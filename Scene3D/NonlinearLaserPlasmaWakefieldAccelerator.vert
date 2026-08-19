#version 330 core
/**
 * @file NonlinearLaserPlasmaWakefieldAccelerator.vert
 * @brief Vertex stage companion to NonlinearLaserPlasmaWakefieldAccelerator.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // x = t [0,1], y = side (-1/+1), z = 0, w = ribbon index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out float vSide;
out float vRibbonID;
out vec3 vCol;
out float vBubblePulse;

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

uniform float bubbleRadiusP;
uniform float ribbonWidthP;
uniform float wakefieldLengthP;

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
    
    float t = time * 0.45 + audioAdvance * 0.4;
    
    // Laser plasma wakefield "bubble" regime: ultraintense laser expels electrons creating spherical ion cavity
    float rBubble = (bubbleRadiusP > 0.01 ? bubbleRadiusP : 0.85);
    float zPos = (tCoord - 0.5) * (wakefieldLengthP > 0.01 ? wakefieldLengthP : 3.6);
    
    // Spherical bubble cross section centered at moving laser pulse z0
    float zLaser = sin(t * 1.5) * 1.0;
    float distZ = abs(zPos - zLaser);
    float bubbleR = sqrt(max(0.0, rBubble * rBubble - distZ * distZ));
    
    float nStrands = 6.0;
    float phi = rIndex * (6.2831853 / nStrands) + zPos * 2.0 + t * 2.0;
    
    vec3 centerPos = vec3(
        cos(phi) * (bubbleR + 0.15),
        sin(phi) * (bubbleR + 0.15),
        zPos
    );
    
    vec3 tangent = normalize(vec3(0.0, 0.0, 1.0));
    vec3 binormal = normalize(vec3(cos(phi), sin(phi), 0.0));
    
    float width = (ribbonWidthP > 0.001 ? ribbonWidthP : 0.045) * (1.0 + 0.3 * audioSwell);
    vec3 worldPos = centerPos + binormal * (side * width);
    
    // Trapped relativistic electron bunch self-injection flash at the back of the bubble
    float atBack = exp(-pow(zPos - (zLaser - rBubble), 2.0) * 25.0);
    float pulse = atBack * (1.0 + 3.5 * audioKick);
    vBubblePulse = pulse;
    
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
