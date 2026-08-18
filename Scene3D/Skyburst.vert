#version 330 core
/**
 * @file Skyburst.vert
 * @brief Vertex stage companion to Skyburst.frag -- see that file's header for
 * this scene's description.
 */
// Skyburst.vert — sparks arrive finished; place them under a night sky.

in vec4 attrA;      // xyz = world position, w = age along the trail
in vec4 attrB;      // x = shell hue, y = brightness

out vec3  vWorld;
out float vAge;
out float vHue;
out float vBright;
out float vDist;

uniform mat4  projM;
uniform float eyeOff;
uniform float audioAdvance;
uniform float audioLevel;

uniform float camHP;

void main()
{
    vec3 p = attrA.xyz;

    // Look slightly upward, because that is where fireworks are.  A rotation in
    // view space, the same way GrassField tilts down.
    const float PITCH = -0.13;
    vec3 vp = vec3(p.x - eyeOff, p.y - camHP, p.z);
    float cs = cos(PITCH), sn = sin(PITCH);
    vp = vec3(vp.x, vp.y * cs + vp.z * sn, -vp.y * sn + vp.z * cs);

    vWorld  = p;
    vAge    = attrA.w;
    vHue    = attrB.x;
    vBright = attrB.y;
    vDist   = p.z;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
