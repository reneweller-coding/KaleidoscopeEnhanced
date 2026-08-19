#version 330 core
/**
 * @file CosmicWebFilamentAnisotropy.vert
 * @brief Vertex stage companion to CosmicWebFilamentAnisotropy.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // w = point index
in vec4 attrB; // 4 seeds in [0,1)

out vec3 vCol;
out float vDensity;

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

uniform float webScaleP;
uniform float pointSizeP;

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
    float t = time * 0.3 + audioAdvance * 0.25;
    
    // Position generation along cosmic filament network
    vec3 seed = attrB.xyz;
    float pIdx = attrA.w;
    
    // Anisotropic filament attractor curves
    float phi = seed.x * 6.2831853;
    float theta = seed.y * 3.14159265;
    float r = pow(seed.z, 0.5) * 3.2 * (webScaleP > 0.01 ? webScaleP : 1.0);
    
    // Filament clustering force (Zel'dovich approximation pancake collapse)
    vec3 spherePos = vec3(
        sin(theta) * cos(phi) * r,
        sin(theta) * sin(phi) * r,
        cos(theta) * r
    );
    
    // Warp into 3 intersecting cosmic filament walls
    vec3 filamentPos = spherePos;
    filamentPos.x += sin(filamentPos.y * 1.5 + t * 0.4) * 0.4;
    filamentPos.y += sin(filamentPos.z * 1.5 + t * 0.3) * 0.4;
    filamentPos.z += sin(filamentPos.x * 1.5 + t * 0.5) * 0.4;
    
    // Density calculation for cluster nodes
    float density = exp(-length(filamentPos) * 0.6) * (1.0 + 0.5 * sin(pIdx * 0.01 + t));
    vDensity = density;
    
    // Palette assignment
    vCol = imgPalette(fract(density * 0.4 + seed.x * 0.3 + audioCentroid));
    
    // Controlled Point Size (Rule V8c: Cap 12-18 px for 60k points)
    float baseSize = (pointSizeP > 0.01 ? pointSizeP : 12.0);
    gl_PointSize = clamp(baseSize * (0.6 + 0.4 * density) + audioKick * 1.2, 4.0, 18.0);
    
    // Camera Transform (V3)
    vec3 vp = filamentPos;
    
    // Slow rotation
    float c = cos(t * 0.1), s = sin(t * 0.1);
    vp = vec3(vp.x * c - vp.z * s, vp.y, vp.x * s + vp.z * c);
    vp.z += 5.5;
    vp.x -= eyeOff;
    
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
