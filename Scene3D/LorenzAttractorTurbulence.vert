#version 330 core
// LorenzAttractorTurbulence.vert
// attrA.x = t (0..1 along ribbon), attrA.y = side (-1..+1 across ribbon),
// attrA.w = ribbon ID (0..19), attrB = seeds (Scene3DShader.cpp GEOM_RIBBON).
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
out float vT;
out float vRibbonID;
out float vVelocity;
out float vSide;

// Integrated strange attractor parametric path
vec3 evalAttractor(float s, float ribbonIdx, float seed) {
    float t_param = s * 14.0 + time * 0.4 + audioAdvance * 0.2 + ribbonIdx * 0.35;
    
    // Non-linear combination of Lorenz & Aizawa attractor harmonic equations
    float sigma = 10.0 + 2.0 * sin(audioAdvance * 0.1);
    float rho = 28.0 + 6.0 * audioBass;
    float beta = 8.0 / 3.0;

    float p1 = sin(t_param * 0.8) * 1.8;
    float p2 = cos(t_param * 0.6) * 1.8;
    float p3 = sin(t_param * 1.4 + seed * 6.28) * 1.2;

    // Strange attractor ribbon vortex coordinates
    float x = sin(t_param) * (2.2 + 0.8 * cos(t_param * 0.5 + ribbonIdx)) + p1 * 0.4;
    float y = cos(t_param * 0.8) * (1.8 + 0.6 * sin(t_param * 0.3)) + p3 * 0.5;
    float z = sin(t_param * 1.2 + ribbonIdx * 0.8) * 2.0 + p2 * 0.6;

    // Swirl around Z axis
    float ang = t_param * 0.2;
    float ca = cos(ang), sa = sin(ang);
    return vec3(x * ca - y * sa, x * sa + y * ca, z);
}

void main() {
    float t = attrA.x;
    float side = attrA.y;
    float ribbonID = attrA.w;
    float seed = attrB.x;

    // Evaluate point and tangent
    float dt = 0.01;
    vec3 pA = evalAttractor(t - dt, ribbonID, seed);
    vec3 pB = evalAttractor(t + dt, ribbonID, seed);
    vec3 p  = evalAttractor(t,      ribbonID, seed);

    vec3 dir = normalize(pB - pA);
    float speed = length(pB - pA) / (2.0 * dt);

    // Compute ribbon side vector perpendicular to tangent and camera
    vec3 upRef = vec3(0.0, 1.0, 0.0);
    if (abs(dot(dir, upRef)) > 0.95) upRef = vec3(1.0, 0.0, 0.0);
    vec3 sideVec = normalize(cross(dir, upRef));

    // Dynamic ribbon width (thicker on beats and high velocity)
    float width = (0.05 + 0.04 * audioKick + 0.03 * sin(t * 20.0 - time * 6.0)) * (0.8 + 0.4 * audioSwell);
    vec3 pos = p + sideVec * (side * width);

    vPos = pos;
    vT = t;
    vRibbonID = ribbonID;
    vVelocity = speed;
    vSide = side;

    // Stereoscopic 3D camera projection
    vec3 vp = pos;
    vp.z += 6.5;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
