#version 330 core
/**
 * @file BismuthFerriteMultiferroicDomains.vert
 * @brief Vertex stage companion to BismuthFerriteMultiferroicDomains.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // xy = corner UV [0,1], z = 0, w = quad index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out vec3 vNormal;
out vec3 vCol;
out float vDomainType;

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

uniform float domainScaleP;
uniform float stepHeightP;

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
    // Remap quad corner UV [0,1] to centered [-1,1] domain
    vec2 localCorner = attrA.xy * 2.0 - 1.0;
    vUV = attrA.xy;
    float qIndex = attrA.w;
    
    float t = time * 0.35 + audioAdvance * 0.3;
    
    // Multiferroic domain grid arrangement (71, 109, 180 degree ferroelectric domains)
    float gridDim = 16.0;
    float ix = mod(qIndex, gridDim);
    float iy = floor(qIndex / gridDim);
    
    // Domain type classification (0, 1, 2)
    float domainType = mod(ix + iy * 2.0 + floor(t * 0.2), 3.0);
    vDomainType = domainType;
    
    // Domain terrace step heights
    float stepH = (stepHeightP > 0.001 ? stepHeightP : 0.08) * (1.0 + 0.5 * audioSwell);
    float zStep = (domainType * stepH) + sin(ix * 0.5 + t) * 0.04;
    
    float scale = (domainScaleP > 0.01 ? domainScaleP : 0.22);
    vec2 centerPos = (vec2(ix, iy) - gridDim * 0.5) * scale;
    
    // Quad orientation based on ferroelectric polarization direction
    float polAngle = domainType * 1.2566 + audioPhase * 0.3;
    float cp = cos(polAngle), sp = sin(polAngle);
    vec2 rotCorner = vec2(localCorner.x * cp - localCorner.y * sp, localCorner.x * sp + localCorner.y * cp) * (scale * 0.48);
    
    vec3 worldPos = vec3(centerPos + rotCorner, zStep);
    
    vNormal = normalize(vec3(sp * 0.3, cp * 0.3, 1.0));
    vCol = imgPalette(fract(domainType * 0.33 + qIndex * 0.01 + audioCentroid));
    
    // Camera Transform (V3)
    vec3 vp = worldPos;
    vp.z += 4.5;
    vp.x -= eyeOff;
    
    // Isometric tilt
    float tilt = 0.65;
    float c = cos(tilt), s = sin(tilt);
    vp = vec3(vp.x, vp.y * c - vp.z * s, vp.y * s + vp.z * c);
    
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
