#version 330 core
/**
 * @file VolcanicBasaltColumnarJointingHexagon.vert
 * @brief Vertex stage companion to VolcanicBasaltColumnarJointingHexagon.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // xyz = cube corner (-0.5..0.5), w = cube index
in vec4 attrB; // 4 seeds in [0,1)

out vec3 vNormal;
out vec3 vCol;
out float vBasaltGlow;

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

uniform float columnPitchP;
uniform float columnHeightP;

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
    vec3 corner = attrA.xyz;
    float cIndex = attrA.w;
    
    float t = time * 0.35 + audioAdvance * 0.3;
    
    // Columnar basalt formation (Giant's Causeway / Fingal's Cave)
    // Hexagonal stepped columns of cooling basalt lava
    float pitch = (columnPitchP > 0.01 ? columnPitchP : 0.22);
    
    float nSide = 12.0;
    float ix = mod(cIndex, nSide);
    float iy = mod(floor(cIndex / nSide), nSide);
    float iz = floor(cIndex / (nSide * nSide));
    
    // Hexagonal stagger
    float hexOffset = mod(iy, 2.0) == 0.0 ? 0.0 : 0.5;
    vec2 pGrid = vec2(ix + hexOffset - nSide * 0.5, iy * 0.866 - nSide * 0.433) * pitch;
    
    // Stepped fracture column heights
    float r = length(pGrid);
    float hMax = (columnHeightP > 0.01 ? columnHeightP : 0.8);
    float stepH = sin(pGrid.x * 4.0 + pGrid.y * 3.0 + t * 0.5) * hMax;
    
    vec3 centerPos = vec3(pGrid.x, pGrid.y, stepH + (iz - 4.0) * 0.15);
    
    // Geothermal magma glow pulse in basalt joint cracks
    float crackGlow = exp(-abs(fract(stepH * 2.0 - t * 1.5) - 0.5) * 16.0) * (1.0 + 3.0 * audioKick);
    vBasaltGlow = crackGlow;
    
    vec3 worldPos = centerPos + corner * vec3(pitch * 0.9, pitch * 0.9, 0.12 * (1.0 + 0.3 * audioSwell));
    vNormal = normalize(corner);
    
    vCol = imgPalette(fract(r * 0.2 + iz * 0.1 + audioCentroid));
    
    // Camera Transform (V3)
    vec3 vp = worldPos;
    
    // 3D rotation
    float tilt = 0.55;
    float c = cos(tilt), s = sin(tilt);
    vp = vec3(vp.x, vp.y * c - vp.z * s, vp.y * s + vp.z * c);
    vp.z += 4.5;
    vp.x -= eyeOff;
    
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
