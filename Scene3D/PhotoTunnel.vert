#version 330 core
/**
 * @file PhotoTunnel.vert
 * @brief Vertex stage companion to PhotoTunnel.frag -- see that file's header for
 * this scene's description.
 */
// PhotoTunnel.vert — flying through a curving tunnel whose walls ARE the
// current image, kaleidoscope-folded and scrolling with the music.  The
// tunnel is a static cylinder mesh (grid bent around the axis); the flight
// feel comes from the scrolling texture + the weaving tunnel path, so the
// connected mesh never tears.  attrA.xy = u (angle) / w (length).

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioBass;
uniform float audioKick;
uniform float audioSwell;
uniform float audioAdvance;

out vec2  vUV;
out float vDist;
out float vAng;

void main()
{
    float u = attrA.x;                     // around the tube
    float w = attrA.y;                     // along the tube

    float z   = 1.5 + w * 150.0;
    float ang = u * 6.2831853;

    // Kick pressure wave runs away from the camera; bass breathes the tube.
    float pulse = exp(-abs(z - (3.0 + 40.0 * fract(time * 0.4))) * 0.10)
                * audioKick;
    float r = 10.0 * (1.0 + 0.06 * audioBass + 0.10 * audioSwell)
            * (1.0 - 0.10 * pulse);

    // The tunnel itself weaves — that is the "steering".
    vec2 path = vec2(6.0 * sin(z * 0.045 + time * 0.30),
                     4.0 * sin(z * 0.034 + time * 0.23 + 2.0));

    vec3 vp = vec3(cos(ang) * r + path.x, sin(ang) * r + path.y, z);

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.06 * gl_Position.w;

    vUV   = vec2(u, w);
    vDist = z;
    vAng  = ang;
}
