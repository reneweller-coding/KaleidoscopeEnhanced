#version 330 core
/**
 * @file SineTunnel.vert
 * @brief Vertex stage companion to SineTunnel.frag -- see that file's header for
 * this scene's description.
 */
// SineTunnel.vert — a smooth procedural warp tunnel (the MilkDrop classic
// without the image): the tube's radius carries slow harmonic ripples
// travelling toward the camera; colours flow along the walls in the frag.
// attrA.x = angle, attrA.y = length.  Static mesh — motion lives in the
// ripple phases and the flowing shading, so nothing tears.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioBass;
uniform float audioSwell;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioDrop;
uniform float audioRotPhase;

out vec2  vUV;
out float vDist;
out float vAng;

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
    // (kick punch wave removed, V7d)
    r *= 1.0 + 0.10 * audioSwell;

    // SERPENTINE FLIGHT: the tube winds through ABSOLUTE space and the
    // camera flies its centreline — sweeping banked curves keep revealing
    // new tunnel around each bend (the fixed straight "hole" is gone).
    float camZ = time * 9.0 + audioAdvance * 14.0;
    float zAbs = z + camZ;
    vec2 path  = vec2(sin(zAbs * 0.022 + 1.0), cos(zAbs * 0.017)) * 10.0
               + vec2(sin(zAbs * 0.008), cos(zAbs * 0.006 + 2.0)) * 7.0;
    vec2 camP  = vec2(sin(camZ * 0.022 + 1.0), cos(camZ * 0.017)) * 10.0
               + vec2(sin(camZ * 0.008), cos(camZ * 0.006 + 2.0)) * 7.0;

    vec3 vp = vec3(cos(ang) * r + path.x - camP.x,
                   sin(ang) * r + path.y - camP.y, z);
    float rollA = audioRotPhase * 0.4 + 0.5 * cos(camZ * 0.022 + 1.0);
    vp.xy = mat2(cos(rollA), -sin(rollA), sin(rollA), cos(rollA)) * vp.xy;

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.06 * gl_Position.w;

    vUV   = vec2(u, w);
    vDist = z;
    vAng  = ang;
}
