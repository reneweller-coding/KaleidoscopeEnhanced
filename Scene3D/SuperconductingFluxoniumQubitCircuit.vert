#version 330 core
/**
 * @file SuperconductingFluxoniumQubitCircuit.vert
 * @brief Vertex stage companion to SuperconductingFluxoniumQubitCircuit.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // x = t [0,1], y = side (-1/+1), z = 0, w = ribbon index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out float vSide;
out float vRibbonID;
out vec3 vCol;
out float vQubitPulse;

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

uniform float circuitRadiusP;
uniform float ribbonWidthP;
uniform float arrayJunctionsP;

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
    
    // Superconducting Fluxonium loop circuit: large loop shunted by an array of Josephson junctions
    float cRad = (circuitRadiusP > 0.01 ? circuitRadiusP : 1.2);
    float loopAngle = tCoord * 6.2831853;
    
    // Josephson junction array superinductance corrugations
    float nJunc = (arrayJunctionsP > 0.01 ? arrayJunctionsP : 16.0);
    float juncCorrugation = sin(tCoord * nJunc * 6.2831853) * 0.05;
    
    float rCurrent = cRad + juncCorrugation;
    float zLayer = (rIndex - 9.5) * 0.07 + sin(loopAngle * 2.0 + t * 0.8) * 0.1;
    
    vec3 centerPos = vec3(
        cos(loopAngle) * rCurrent,
        sin(loopAngle) * rCurrent,
        zLayer
    );
    
    vec3 tangent = normalize(vec3(-sin(loopAngle), cos(loopAngle), 0.0));
    vec3 binormal = normalize(cross(tangent, vec3(0.0, 0.0, 1.0)));
    
    float width = (ribbonWidthP > 0.001 ? ribbonWidthP : 0.05) * (1.0 + 0.3 * audioSwell);
    vec3 worldPos = centerPos + binormal * (side * width);
    
    // Quantum phase slip / microwave pulse traveling through qubit loop
    float pulse = exp(-abs(fract(tCoord * 2.0 - t * 3.0 + rIndex * 0.2) - 0.5) * 16.0) * (1.0 + 3.0 * audioKick);
    vQubitPulse = pulse;
    
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
