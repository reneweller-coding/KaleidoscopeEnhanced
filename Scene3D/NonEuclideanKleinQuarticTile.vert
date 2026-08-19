#version 330 core
/**
 * @file NonEuclideanKleinQuarticTile.vert
 * @brief Vertex stage companion to NonEuclideanKleinQuarticTile.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // xy = Patch UV [0,1], z = 0, w = Patch index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out vec3 vNormal;
out vec3 vCol;
out float vFacetID;

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

uniform float quarticScaleP;
uniform float heptagonP;

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
    // Remap patch UV [0,1] to centered [-1,1] domain
    vec2 uv = attrA.xy * 2.0 - 1.0;
    vUV = attrA.xy;
    vFacetID = attrA.w;
    
    float t = time * 0.35 + audioAdvance * 0.3;
    
    // Hyperbolic heptagonal tiling of the Klein quartic surface (genus 3)
    float u = uv.x * 3.14159265;
    float v = uv.y * 3.14159265;
    
    float scale = (quarticScaleP > 0.01 ? quarticScaleP : 1.3) * (0.9 + 0.2 * audioSwell);
    
    // Immersion of genus 3 Klein Quartic into 3D: Tetrus / Lawson minimal surface
    float cu = cos(u), su = sin(u);
    float cv = cos(v), sv = sin(v);
    
    // 3-fold tetrahedral symmetry with heptagonal warping
    float r7 = 1.0 + 0.25 * sin(7.0 * u + t * 0.8) * (heptagonP > 0.01 ? heptagonP : 1.0);
    
    vec3 worldPos = vec3(
        cu * (1.0 + 0.4 * cv) * r7,
        su * (1.0 + 0.4 * cv) * r7,
        sv * 0.7 + 0.2 * sin(3.0 * u + t * 0.5)
    ) * scale;
    
    // Surface normal
    vNormal = normalize(vec3(cu * cv, su * cv, sv));
    
    vCol = imgPalette(fract(attrA.w * 0.0416 + attrA.x * 0.2 + audioCentroid));
    
    // Camera Transform (V3)
    vec3 vp = worldPos;
    
    // 3D rotation
    float c = cos(t * 0.2), s = sin(t * 0.2);
    vp = vec3(vp.x * c - vp.z * s, vp.y, vp.x * s + vp.z * c);
    vp.z += 4.5;
    vp.x -= eyeOff;
    
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
