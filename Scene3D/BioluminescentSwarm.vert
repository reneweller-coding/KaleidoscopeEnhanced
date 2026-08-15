#version 330 core
// BioluminescentSwarm.vert — Indirect render pass for compute boids
in vec4 attrA; // xyz = world pos, w = hue
in vec4 attrB; // xyz = normal, w = glow

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform float audioAdvance;
uniform float audioSwell;
uniform float hueP;

out vec4 vCol;
out vec3 vNormal;
out vec3 vWorld;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    vec3 worldP = attrA.xyz;
    float hue = attrA.w;
    vec3 norm = attrB.xyz;
    float glow = attrB.w;

    // Orbiting Camera
    float camAngle = time * 0.12 + audioAdvance * 0.04;
    float camDist = 28.0 - audioSwell * 5.0;
    vec3 camPos = vec3(sin(camAngle) * camDist, 12.0 + 3.0 * sin(time * 0.15), cos(camAngle) * camDist);
    vec3 lookTarget = vec3(0.0, 0.0, 0.0);

    vec3 ww = normalize(lookTarget - camPos);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);

    vec3 relP = worldP - camPos;
    vec3 viewP = vec3(dot(relP, uu), dot(relP, vv), dot(relP, ww));

    viewP.x -= eyeOff;
    gl_Position = projM * vec4(viewP.x, viewP.y, -viewP.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    // Bioluminescent spectral color
    vec3 boidCol = mix(vec3(0.0, 1.0, 0.8), vec3(0.9, 0.1, 1.0), hue);
    boidCol = mix(boidCol, vec3(1.0, 0.9, 0.2), glow * 0.3);

    float h = (hueP > 0.0) ? hueP : 0.0;
    if (h > 0.001) boidCol = hueRot(boidCol, h);

    vCol = vec4(boidCol * glow, 1.0);
    vNormal = norm;
    vWorld = worldP;
}
