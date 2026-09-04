#version 330 core
/**
 * @file SPHFluidSplash.vert
 * @brief Vertex stage companion to SPHFluidSplash.frag -- see that file's
 * header and SPHFluidSplash.comp for this scene's description.
 */
in vec4 attrA;   // xyz = world position, w = particle index
in vec4 attrB;   // xyz = per-particle hash seed, w = density/REST_DENS

out vec3  vWorld;
out vec3  vSeed;
out float vDensRatio;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform float audioAdvance;
uniform float audioSwell;

void main()
{
    vec3 worldP = attrA.xyz;

    // Orbiting camera looking at the container's centre -- same shape as
    // BioluminescentSwarm's, scaled down to this scene's ~3.2-unit box.
    float camAngle = time * 0.10 + audioAdvance * 0.05;
    // Closer: at 10 units the 3.2-unit box was a stamp in the middle of a
    // black frame (reported).
    float camDist  = 3.9 - audioSwell * 0.4;
    vec3 camPos = vec3(sin(camAngle) * camDist, 1.7 + 0.5 * sin(time * 0.13), cos(camAngle) * camDist);
    vec3 lookTarget = vec3(0.0, -0.6, 0.0);

    vec3 ww = normalize(lookTarget - camPos);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);

    vec3 relP = worldP - camPos;
    vec3 viewP = vec3(dot(relP, uu), dot(relP, vv), dot(relP, ww));

    viewP.x -= eyeOff;
    gl_Position = projM * vec4(viewP.x, viewP.y, -viewP.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    vWorld     = worldP;
    vSeed      = attrB.xyz;
    vDensRatio = attrB.w;
}
