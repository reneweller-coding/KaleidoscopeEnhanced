#version 330 core
// attrA.xy = quad-local corner uv (0..1), attrA.w = quad id, attrB = seeds
// (Scene3DShader.cpp GEOM_QUADS)
in vec4 attrA;
in vec4 attrB;

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
out float vTier;
out float vReadLaser;

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 23.45;
    p *= p + p;
    return fract(p);
}

void main() {
    float quadID = attrA.w;
    float seed = hash11(quadID);

    // Organize quads into 16 cylindrical storage tiers
    float tier = floor(quadID / 180.0);
    float tierAngle = mod(quadID, 180.0) / 180.0 * 6.2831853;

    float radius = 2.2 + 0.15 * sin(tier * 3.0 + time * 0.5);
    float height = (tier - 8.0) * 0.35 + sin(tierAngle * 4.0 + time) * 0.1;

    // Orbiting rotation
    float t = time * 0.2 + audioAdvance * 0.1;
    float currentAngle = tierAngle + t * (0.5 + 0.1 * tier);

    vec3 waferCenter = vec3(radius * cos(currentAngle), height, radius * sin(currentAngle));

    // Orientation: Face towards central laser emitter axis with slight tilt
    vec3 tangent = vec3(-sin(currentAngle), 0.0, cos(currentAngle));
    vec3 bitangent = vec3(0.0, 1.0, 0.0);

    // Quad local vertex offset
    vec2 offset = attrA.xy - vec2(0.5);
    float waferScale = 0.14 + 0.03 * sin(quadID * 0.1);

    vec3 localPos = offset.x * tangent * waferScale * 1.6 + offset.y * bitangent * waferScale;
    vec3 pos = waferCenter + localPos;

    // Read laser scanning beam on audio kicks & mid frequencies
    float laserHit = exp(-abs(height - sin(time * 3.0) * 2.0) * 4.0) * (0.8 + audioMid * 1.2);

    vPos = pos;
    vUV = attrA.xy;
    vTier = tier / 16.0;
    vReadLaser = laserHit;

    // Stereoscopic 3D camera projection
    vec3 vp = pos;
    vp.z += 4.8;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
