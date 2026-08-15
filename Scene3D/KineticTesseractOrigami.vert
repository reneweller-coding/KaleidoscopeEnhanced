#version 330 core
layout(location = 0) in vec3 inPos;
layout(location = 1) in vec3 inNormal;
layout(location = 2) in vec2 inTexCoord;

uniform mat4 projM;
uniform float eyeOff;
uniform float time;
uniform float audioPhase;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioSwell;

out vec3 vPos;
out vec2 vUV;
out float vFoldAngle;

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 71.19;
    p *= p + p;
    return fract(p);
}

void main() {
    float quadID = floor(float(gl_VertexID) / 6.0);
    float seed = hash11(quadID);

    // 50x60 Miura-ori origami facet grid
    float gridX = mod(quadID, 50.0);
    float gridY = floor(quadID / 50.0);

    vec2 gridUV = (vec2(gridX, gridY) - vec2(25.0, 30.0)) / 25.0;

    // Folding angle gamma (0 = flat, pi/2 = fully folded compact)
    float t = time * 0.35 + audioAdvance * 0.2;
    float fold = (0.5 + 0.45 * sin(t * 0.7 + length(gridUV) * 2.0)) * (1.0 - 0.3 * audioKick);

    // Miura-ori fold equations:
    float a = 0.12; // Facet length
    float b = 0.12; // Facet width
    float alpha = 1.047; // 60 degrees

    float v = asin(sin(alpha) * sin(fold));
    float u = asin(cos(alpha) / max(cos(v), 0.001));

    float x = (gridX - 25.0) * a * cos(v);
    float y = (gridY - 30.0) * b * cos(u);
    float z = ((mod(gridX + gridY, 2.0) == 0.0) ? 1.0 : -1.0) * a * sin(fold) * (1.0 + audioBass * 0.5);

    vec3 facetCenter = vec3(x, y, z);

    // Local vertex of quad
    vec2 offset = inTexCoord - vec2(0.5);
    vec3 localPos = vec3(offset.x * a * 0.95, offset.y * b * 0.95, 0.0);
    vec3 pos = facetCenter + localPos;

    vPos = pos;
    vUV = inTexCoord;
    vFoldAngle = fold;

    // Stereoscopic 3D camera projection
    vec3 vp = pos;
    vp.z += 4.5;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
