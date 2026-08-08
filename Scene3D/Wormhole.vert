#version 120
// Wormhole.vert — flying through a chain of gravitational-lensing throats:
// the tube's radius pinches toward zero at a periodic "event horizon" that
// slides toward the camera and loops, so the flight reads as passing
// through one wormhole mouth after another forever.  The IMAGE papers the
// walls (kaleido-folded); the fragment shader bends it near each horizon.
//   attrA.x = angle (u), attrA.y = length (w).  Geometry always spans the
//   visible tube ahead of the camera — motion lives in time, not in a
//   moving mesh (never puts the camera outside the tube).

attribute vec4 attrA;
attribute vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioAdvance;
uniform float audioBass;
uniform float audioSwell;

varying vec2  vUV;
varying float vDist;
varying float vAng;
varying float vLensAmt;

void main()
{
    float u = attrA.x;
    float w = attrA.y;

    float z   = 1.5 + w * 150.0;
    float ang = u * 6.2831853;

    // The throat slides from far to near and loops — a repeating chain of
    // pinches the camera flies through.
    const float period = 90.0;
    float slide    = mod(time * 12.0 + audioAdvance * 20.0, period);
    float throatZ  = 150.0 - slide;                 // 150 (far) -> 0 (near)
    float dz       = z - throatZ;
    float lensAmt  = exp(-dz * dz * 0.010);          // 1 at the horizon

    float r = (9.0 + 1.5 * audioBass) * (1.0 - 0.86 * lensAmt)
            * (1.0 + 0.05 * audioSwell);
    r = max(r, 0.35);                                // never fully collapses

    vec3 vp = vec3(cos(ang) * r, sin(ang) * r, z);

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.06 * gl_Position.w;

    vUV      = vec2(u, w);
    vDist    = z;
    vAng     = ang;
    vLensAmt = lensAmt;
}
