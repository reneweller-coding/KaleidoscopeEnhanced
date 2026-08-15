#version 330 core
layout(location = 0) in vec3 inPos;
layout(location = 1) in vec3 inNormal;

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
out float vEnergy;
out float vSpecies;

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 67.89;
    p *= p + p;
    return fract(p);
}

void main() {
    float id = float(gl_VertexID);
    float seed = hash11(id);
    float seed2 = hash11(id + 1000.0);
    float seed3 = hash11(id + 2000.0);

    // Collision event cycle: particles spray outwards from center (0,0,0)
    float tCollision = fract(time * 0.8 + audioAdvance * 0.3 + seed * 0.1);
    float burstSpeed = (2.0 + 3.0 * seed2) * (1.0 + audioKick * 1.5);

    // Initial ejection direction (isotropic spherical spray)
    float theta = acos(seed2 * 2.0 - 1.0);
    float phi = seed3 * 6.2831853;
    vec3 dir = vec3(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta));

    // Magnetic solenoid field curvature: helical Lorentz force trajectory
    float charge = (seed > 0.5) ? 1.0 : -1.0;
    float bField = (1.5 + audioBass * 2.0) * charge;

    float r = tCollision * burstSpeed;
    float helixAngle = phi + r * bField;

    vec3 pos = vec3(r * cos(helixAngle), r * sin(helixAngle), dir.z * r * 2.0);

    vPos = pos;
    vEnergy = (1.0 - tCollision) * (1.0 + audioKick * 2.0);
    vSpecies = seed;

    // Stereoscopic 3D camera projection
    vec3 vp = pos;
    vp.z += 5.2;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    gl_PointSize = clamp((3.0 + 4.0 * vEnergy + audioHigh * 4.0) * (5.5 / vp.z), 1.0, 32.0);
}
