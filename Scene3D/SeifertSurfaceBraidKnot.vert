#version 330 core
/**
 * @file SeifertSurfaceBraidKnot.vert
 * @brief Vertex stage companion to SeifertSurfaceBraidKnot.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // x = t [0,1], y = side (-1/+1), z = 0, w = ribbon index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out float vSide;
out float vRibbonID;
out vec3 vCol;
out vec3 vNormal;

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

uniform float knotP;
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
    
    // (p, q) Torus knot / Braid knot trajectory
    float p = 3.0;
    float q = 5.0 * (knotP > 0.01 ? knotP : 1.0);
    float phi = tCoord * 6.2831853 * 2.0;
    
    float strandOffset = rIndex * 0.31415927; // spread ALL 20 ribbons around the
    // ring -- bunched at 0.15 rad they stacked near-coincident and the
    // additive pass burned the braid to white
    float r = 1.4 + 0.45 * cos(q * phi + strandOffset + t * 0.5);
    
    vec3 centerPos = vec3(
        r * cos(p * phi + audioPhase * 0.2),
        r * sin(p * phi + audioPhase * 0.2),
        -0.65 * sin(q * phi + strandOffset + t * 0.5)
    );
    
    // Tangent derivative
    vec3 tangent = normalize(vec3(
        -p * r * sin(p * phi) - q * 0.45 * sin(q * phi) * cos(p * phi),
         p * r * cos(p * phi) - q * 0.45 * sin(q * phi) * sin(p * phi),
        -0.65 * q * cos(q * phi)
    ));
    vec3 binormal = normalize(cross(tangent, vec3(0.0, 0.0, 1.0)));
    vec3 normal = normalize(cross(binormal, tangent));
    vNormal = normal;
    
    // Seifert ribbon surface extrusion
    float width = (ribbonWidthP > 0.001 ? ribbonWidthP : 0.06) * (1.0 + 0.4 * audioSwell);
    vec3 worldPos = centerPos + binormal * (side * width);
    
    // Vertex color from photo palette
    vCol = imgPalette(fract(rIndex * 0.08 + tCoord * 0.2 + audioCentroid));
    
    // Camera Transform (V3)
    vec3 vp = worldPos;
    
    // Smooth 3D rotation
    float c = cos(t * 0.2), s = sin(t * 0.2);
    vp = vec3(vp.x * c - vp.z * s, vp.y, vp.x * s + vp.z * c);
    vp.z += 4.8;
    vp.x -= eyeOff;
    
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
