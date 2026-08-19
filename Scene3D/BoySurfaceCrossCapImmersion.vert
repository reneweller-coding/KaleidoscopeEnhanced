#version 330 core
/**
 * @file BoySurfaceCrossCapImmersion.vert
 * @brief Vertex stage companion to BoySurfaceCrossCapImmersion.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // xy = Patch UV [0,1], z = 0, w = Cell index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out vec3 vNormal;
out vec3 vCol;
out float vTriplePoint;

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

uniform float boyScaleP;
uniform float symmetryP;

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
    // Remap grid UV [0,1] to centered [-1,1] domain
    vec2 uv = attrA.xy * 2.0 - 1.0;
    vUV = attrA.xy;
    
    float t = time * 0.35 + audioAdvance * 0.3;
    
    // Polar coordinates for projective disk
    float r = length(uv) * 0.95;
    float theta = atan(uv.y, uv.x) + audioPhase * 0.2;
    
    // Boy's surface 3-fold symmetry immersion coordinates
    float sym = (symmetryP > 0.01 ? symmetryP : 1.0);
    float u = r * cos(theta);
    float v = r * sin(theta);
    
    // Parametric immersion: Bryant-Kusner / Apery equations
    float d = 1.0 + u * u + v * v;
    float x = (2.0 * (u * u - v * v) + u * (u * u + v * v) * sym) / (d * sqrt(2.0));
    float y = (2.0 * u * v - v * (u * u + v * v) * sym) / (d * sqrt(2.0));
    float z = (u * u + v * v) / d * (0.8 + 0.4 * audioSwell);
    
    float scale = 2.2 * (boyScaleP > 0.01 ? boyScaleP : 1.0);
    vec3 worldPos = vec3(x, y, z - 0.5) * scale;
    
    // Normal calculation
    vec3 n = normalize(vec3(x * 1.5, y * 1.5, z * 2.0 - 1.0));
    vNormal = n;
    
    // Triple self-intersection point indicator (near origin where 3 sheets cross)
    float trip = exp(-length(worldPos) * 2.5) * (1.0 + 3.0 * audioKick);
    vTriplePoint = trip;
    
    vCol = imgPalette(fract(theta * 0.159 * 3.0 + r * 0.4 + audioCentroid));
    
    // Camera Transform (V3)
    vec3 vp = worldPos;
    
    // 3D rotation
    float c = cos(t * 0.25), s = sin(t * 0.25);
    vp = vec3(vp.x * c - vp.z * s, vp.y, vp.x * s + vp.z * c);
    vp.z += 4.8;
    vp.x -= eyeOff;
    
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
