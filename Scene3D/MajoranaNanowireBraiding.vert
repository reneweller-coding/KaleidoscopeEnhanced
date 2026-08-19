#version 330 core
/**
 * @file MajoranaNanowireBraiding.vert
 * @brief Vertex stage companion to MajoranaNanowireBraiding.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // x = t [0,1], y = side (-1/+1), z = 0, w = ribbon index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out float vSide;
out float vRibbonID;
out vec3 vCol;
out float vMajoranaZeroMode;

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
uniform float braidSpeedP;

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
    float vBraid = (braidSpeedP > 0.01 ? braidSpeedP : 1.2);
    
    // Braiding 3 pairs of semiconductor nanowires in 3D spacetime
    float strandPhase = rIndex * 1.04719755; // 6 strands
    float zPos = (tCoord - 0.5) * 3.6;
    
    // Non-Abelian braiding permutations (braid group generators sigma_1, sigma_2)
    float braidTime = zPos * 2.0 + t * vBraid;
    float rBraid = 0.65 + 0.25 * sin(braidTime * 0.5 + strandPhase);
    float phiBraid = strandPhase + sin(braidTime + strandPhase) * 1.2;
    
    vec3 centerPos = vec3(
        cos(phiBraid) * rBraid,
        sin(phiBraid) * rBraid,
        zPos
    );
    
    // Tangent and binormal vectors for ribbon geometry
    vec3 tangent = normalize(vec3(-sin(phiBraid) * rBraid, cos(phiBraid) * rBraid, 1.0));
    vec3 binormal = normalize(cross(tangent, vec3(0.0, 0.0, 1.0)));
    
    float width = (ribbonWidthP > 0.001 ? ribbonWidthP : 0.045) * (1.0 + 0.3 * audioSwell);
    vec3 worldPos = centerPos + binormal * (side * width);
    
    // Majorana Zero Mode localized wavepackets at the wire ends (tCoord near 0 and 1)
    float endProximity = max(exp(-tCoord * 14.0), exp(-(1.0 - tCoord) * 14.0));
    float mzm = endProximity * (1.0 + 3.5 * audioKick);
    vMajoranaZeroMode = mzm;
    
    vCol = imgPalette(fract(rIndex * 0.166 + tCoord * 0.2 + audioCentroid));
    
    // Camera Transform (V3)
    vec3 vp = worldPos;
    
    // Isometric camera rotation
    float c = cos(t * 0.2), s = sin(t * 0.2);
    vp = vec3(vp.x * c - vp.z * s, vp.y, vp.x * s + vp.z * c);
    vp.z += 4.5;
    vp.x -= eyeOff;
    
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
