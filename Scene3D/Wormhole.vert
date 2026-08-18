#version 330 core
/**
 * @file Wormhole.vert
 * @brief Vertex stage companion to Wormhole.frag -- see that file's header for
 * this scene's description.
 */
// Wormhole.vert — flying through a chain of gravitational-lensing throats:
// the tube's radius pinches toward zero at a periodic "event horizon" that
// slides toward the camera and loops, so the flight reads as passing
// through one wormhole mouth after another forever.  The IMAGE papers the
// walls (kaleido-folded); the fragment shader bends it near each horizon.
//   attrA.x = angle (u), attrA.y = length (w).  Geometry always spans the
//   visible tube ahead of the camera — motion lives in time, not in a
//   moving mesh (never puts the camera outside the tube).

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioAdvance;
uniform float audioBass;
uniform float audioSwell;

out vec2  vUV;
out float vDist;
out float vAng;
out float vLensAmt;

void main()
{
    float u = attrA.x;
    float w = attrA.y;

    float z   = 1.5 + w * 150.0;
    float ang = u * 6.2831853;

    // TWO event horizons, half a period apart, each travelling the FULL way
    // from beyond the far fog to BEHIND the camera before recycling.  Each
    // throat's pinch strength fades in while it is still far away and opens
    // back up just before the camera passes through it — so the fly-through
    // completes properly and the recycle happens while the throat is
    // invisible (the old single-throat mod() vanished mid-view and popped
    // back at the far end: the "collapse and restart" artefact).
    float travel  = (time * 12.0 + audioAdvance * 20.0) / 170.0;
    float lensAmt = 0.0;
    for (int k = 0; k < 2; ++k)
    {
        float ph      = fract(travel + float(k) * 0.5);
        float throatZ = 165.0 - ph * 175.0;          // 165 (far) -> -10 (behind)
        float fade    = smoothstep(160.0, 135.0, throatZ)   // fade in far away
                      * smoothstep(-8.0, 12.0, throatZ);    // open up at the camera
        float dz      = z - throatZ;
        lensAmt = max(lensAmt, exp(-dz * dz * 0.010) * fade);
    }

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
