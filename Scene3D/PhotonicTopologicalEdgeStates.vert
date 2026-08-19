#version 330 core
/**
 * @file PhotonicTopologicalEdgeStates.vert
 * @brief Vertex stage companion to PhotonicTopologicalEdgeStates.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // x = t in [0,1], y = side (-1/+1), z = 0, w = ribbon index
in vec4 attrB; // 4 hash seeds in [0,1)

out vec2 vUV;
out float vSide;
out float vRibbonID;
out vec3 vCol;
out float vPulse;

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

uniform float ribbonWidthP;
uniform float edgeSpeedP;

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
    
    float t = time * 0.4 + audioAdvance * 0.35;
    
    // Hexagonal lattice pathing for topological edge states
    float hexAngle = rIndex * 1.04719755; // 60-degree increments
    float radius = 1.8 + 0.5 * sin(rIndex * 1.3 + audioPhase);
    
    // Waveguide strand center trajectory in 3D
    float phi = tCoord * 6.2831853 * 2.0 + hexAngle;
    vec3 centerPos = vec3(
        cos(phi) * (radius + 0.3 * sin(phi * 3.0 + t)),
        sin(phi) * (radius + 0.3 * cos(phi * 3.0 + t)),
        sin(phi * 2.0 + rIndex) * 0.6
    );
    
    // Tangent and normal vectors for ribbon extrusion
    vec3 tangent = normalize(vec3(-sin(phi), cos(phi), 0.3 * cos(phi * 2.0)));
    vec3 normal  = normalize(cross(tangent, vec3(0.0, 0.0, 1.0)));
    
    float width = (ribbonWidthP > 0.001 ? ribbonWidthP : 0.045) * (1.0 + 0.3 * audioSwell);
    vec3 worldPos = centerPos + normal * (side * width);
    
    // Travelling topological laser pulse along the ribbon
    float pulseSpeed = (edgeSpeedP > 0.01 ? edgeSpeedP : 1.5);
    float pulsePhase = fract(tCoord * 4.0 - t * pulseSpeed + rIndex * 0.15);
    vPulse = exp(-abs(pulsePhase - 0.5) * 16.0) * (1.0 + 3.0 * audioKick);
    
    // Per-vertex color from photo palette
    vCol = imgPalette(fract(rIndex * 0.12 + tCoord * 0.3 + audioCentroid));
    
    // Engine Camera Transformation (V3)
    vec3 vp = worldPos;
    vp.z += 4.5;
    vp.x -= eyeOff;
    
    // Tilt slightly for isometric view
    float tilt = 0.35;
    float c = cos(tilt), s = sin(tilt);
    vp = vec3(vp.x, vp.y * c - vp.z * s, vp.y * s + vp.z * c);
    
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
