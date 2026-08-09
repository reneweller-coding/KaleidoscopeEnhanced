#version 120
// SineTunnel.vert — a smooth procedural warp tunnel (the MilkDrop classic
// without the image): the tube's radius carries slow harmonic ripples
// travelling toward the camera; colours flow along the walls in the frag.
// attrA.x = angle, attrA.y = length.  Static mesh — motion lives in the
// ripple phases and the flowing shading, so nothing tears.

attribute vec4 attrA;
attribute vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioBass;
uniform float audioSwell;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioDrop;
uniform float audioRotPhase;

varying vec2  vUV;
varying float vDist;
varying float vAng;

void main()
{
    float u = attrA.x;
    float w = attrA.y;

    float z   = 1.5 + w * 140.0;
    float ang = u * 6.2831853;

    // Harmonic radius ripples travelling down the tube — all smooth.
    float ph = time * 0.8 + audioAdvance * 1.0;
    float r = 10.0
            + sin(z * 0.20 - ph)               * (0.7 + 1.4 * audioBass)
            + sin(z * 0.09 + ph * 0.5)         * 0.8
            + sin(ang * 3.0 + z * 0.06 - ph * 0.3) * 0.6;
    r *= 1.0 + 0.06 * audioSwell;

    // KICK PUNCH: a sharp constriction ring races away from the camera on
    // every kick; a DROP blows the whole tube wide for a beat.
    float punchZ = fract(z * 0.02 - audioAdvance * 0.15);
    r -= 2.8 * audioKick * exp(-punchZ * 10.0);
    r *= 1.0 + 0.35 * audioDrop;

    // Straight tube, but the camera ROLLS continuously (integrated phase)
    // and weaves a small figure-eight off the axis — a flown tunnel, not a
    // stared-down one.
    vec3 vp = vec3(cos(ang) * r, sin(ang) * r, z);
    float rollA = audioRotPhase * 0.4 + time * 0.06;
    vp.xy = mat2(cos(rollA), -sin(rollA), sin(rollA), cos(rollA)) * vp.xy;
    vp.x += sin(time * 0.31) * 2.2 * (z * 0.012);
    vp.y += sin(time * 0.23 + 1.6) * 1.8 * (z * 0.012);

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.06 * gl_Position.w;

    vUV   = vec2(u, w);
    vDist = z;
    vAng  = ang;
}
