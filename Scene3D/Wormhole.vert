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

in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

out vec2  vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out float vDist;   ///< Distance (from the vertex stage).
out float vAng;
out float vLensAmt;

/// @brief Entry point of this shader stage (the file description says what it draws).
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

    float r = (9.0 + 1.0 * audioSwell) * (1.0 - 0.86 * lensAmt)
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
