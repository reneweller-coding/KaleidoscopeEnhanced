#version 330 core
/**
 * @file DNAOrigamiNanotubeLattice.vert
 * @brief Vertex stage companion to DNAOrigamiNanotubeLattice.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // x = t [0,1], y = side (-1/+1), z = 0, w = ribbon index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out float vSide;
out float vRibbonID;
out vec3 vCol;
out float vFluorPulse;

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

uniform float tubeRadiusP;
uniform float helixTurnsP;
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
    
    // Multi-bundle DNA origami cylindrical nanotube: 6 double helices bundled in a ring
    float bundleAngle = rIndex * 0.31415927; // 20 bundles (engine builds 20 ribbons)
    float tubeR = (tubeRadiusP > 0.01 ? tubeRadiusP : 0.65);
    
    // DNA helical twist along bundle axis z
    float turns = (helixTurnsP > 0.01 ? helixTurnsP : 8.0);
    float zPos = (tCoord - 0.5) * 3.6;
    float helixAngle = zPos * turns + bundleAngle + t * 1.5;
    
    float doubleHelixR = 0.12;
    vec3 bundleCenter = vec3(
        cos(bundleAngle) * tubeR,
        sin(bundleAngle) * tubeR,
        zPos
    );
    
    // DNA strand wrapping around bundle center
    vec3 centerPos = bundleCenter + vec3(
        cos(helixAngle) * doubleHelixR,
        sin(helixAngle) * doubleHelixR,
        0.0
    );
    
    vec3 tangent = normalize(vec3(-sin(helixAngle) * doubleHelixR * turns, cos(helixAngle) * doubleHelixR * turns, 1.0));
    vec3 binormal = normalize(cross(tangent, vec3(0.0, 0.0, 1.0)));
    
    float width = (ribbonWidthP > 0.001 ? ribbonWidthP : 0.035) * (1.0 + 0.3 * audioSwell);
    vec3 worldPos = centerPos + binormal * (side * width);
    
    // Fluorescent dye fluorophore tagging pulses along DNA origami scaffold
    float pulse = exp(-abs(fract(tCoord * 12.0 - t * 2.0 + rIndex * 0.1) - 0.5) * 16.0) * (1.0 + 3.0 * audioKick);
    vFluorPulse = pulse;
    
    vCol = imgPalette(fract(rIndex * 0.166 + tCoord * 0.25 + audioCentroid));
    
    // Camera Transform (V3)
    vec3 vp = worldPos;
    
    // 3D camera rotation
    float c = cos(t * 0.15), s = sin(t * 0.15);
    vp = vec3(vp.x * c - vp.z * s, vp.y, vp.x * s + vp.z * c);
    vp.z += 4.5;
    vp.x -= eyeOff;
    
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
