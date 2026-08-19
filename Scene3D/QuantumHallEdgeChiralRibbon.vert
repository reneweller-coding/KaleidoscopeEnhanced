#version 330 core
/**
 * @file QuantumHallEdgeChiralRibbon.vert
 * @brief Vertex stage companion to QuantumHallEdgeChiralRibbon.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // x = t [0,1], y = side (-1/+1), z = 0, w = ribbon index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out float vSide;
out float vRibbonID;
out vec3 vCol;
out float vChiralPulse;

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
uniform float landauRadiusP;

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
    float vSpeed = (edgeSpeedP > 0.01 ? edgeSpeedP : 1.2);
    
    // Nested concentric chiral edge states for different Landau levels (nu = 1, 2, 3, ...)
    float landauLevel = rIndex + 1.0;
    float baseR = (0.4 + landauLevel * 0.22) * (landauRadiusP > 0.01 ? landauRadiusP : 1.0);
    
    // Chiral perimeter trajectory around 2D electron gas island
    float perimeterAngle = tCoord * 6.2831853 + t * vSpeed * (1.0 / sqrt(landauLevel));
    
    // Mesoscopic boundary oscillations (skipping orbits along boundary)
    float skipWaves = sin(tCoord * 24.0 * landauLevel - t * 4.0) * 0.04;
    float currentR = baseR + skipWaves;
    
    float zLayer = (landauLevel - 3.0) * 0.15 + sin(perimeterAngle * 3.0 + t * 0.5) * 0.08;
    
    vec3 centerPos = vec3(
        cos(perimeterAngle) * currentR,
        sin(perimeterAngle) * currentR,
        zLayer
    );
    
    vec3 tangent = normalize(vec3(-sin(perimeterAngle), cos(perimeterAngle), 0.0));
    vec3 binormal = normalize(cross(tangent, vec3(0.0, 0.0, 1.0)));
    
    float width = (ribbonWidthP > 0.001 ? ribbonWidthP : 0.045) * (1.0 + 0.3 * audioSwell);
    vec3 worldPos = centerPos + binormal * (side * width);
    
    // Chiral 1D ballistic electron wavepacket flash
    float pulse = exp(-abs(fract(tCoord * 4.0 - t * 2.0 * vSpeed) - 0.5) * 16.0) * (1.0 + 3.0 * audioKick);
    vChiralPulse = pulse;
    
    vCol = imgPalette(fract(rIndex * 0.15 + tCoord * 0.2 + audioCentroid));
    
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
}
