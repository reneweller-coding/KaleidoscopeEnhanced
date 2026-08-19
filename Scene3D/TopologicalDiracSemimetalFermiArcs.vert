#version 330 core
/**
 * @file TopologicalDiracSemimetalFermiArcs.vert
 * @brief Vertex stage companion to TopologicalDiracSemimetalFermiArcs.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // x = t [0,1], y = side (-1/+1), z = 0, w = ribbon index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out float vSide;
out float vRibbonID;
out vec3 vCol;
out float vWeylPulse;

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

uniform float nodeDistP;
uniform float ribbonWidthP;
uniform float arcCurvP;

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
    
    // Topological Dirac/Weyl semimetal Fermi Arcs: open disjoint arcs connecting Weyl nodes (+ and - chirality)
    float dNodes = (nodeDistP > 0.01 ? nodeDistP : 1.4);
    float kCurv  = (arcCurvP > 0.01 ? arcCurvP : 1.2);
    
    // Disjoint open Fermi arc from node (-d/2, 0) to (+d/2, 0).
    // The engine builds 20 ribbons (indices 0..19) -- the layer spread
    // must centre on 9.5, not 2.5, or 14 of the arcs stack away into the
    // view depth.  Nested arc heights give the fan its layering instead.
    float xPos = (tCoord - 0.5) * dNodes;
    float yPos = (1.0 - 4.0 * (tCoord - 0.5) * (tCoord - 0.5)) * 0.6 * kCurv * (0.55 + 0.045 * rIndex) - 0.3;
    float zLayer = (rIndex - 9.5) * 0.09 + sin(tCoord * 12.0 - t * 2.5) * 0.08;
    
    vec3 centerPos = vec3(xPos, yPos, zLayer);
    
    vec3 tangent = normalize(vec3(dNodes, -8.0 * (tCoord - 0.5) * 0.6 * kCurv, 0.0));
    vec3 binormal = normalize(cross(tangent, vec3(0.0, 0.0, 1.0)));
    
    float width = (ribbonWidthP > 0.001 ? ribbonWidthP : 0.05) * (1.0 + 0.3 * audioSwell);
    vec3 worldPos = centerPos + binormal * (side * width);
    
    // Chiral anomaly / Weyl node current pulse
    float pulse = exp(-abs(fract(tCoord * 2.0 - t * 3.0 + rIndex * 0.166) - 0.5) * 16.0) * (1.0 + 3.0 * audioKick);
    vWeylPulse = pulse;
    
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
