#version 330 core
/**
 * @file BillboardCity.vert
 * @brief Vertex stage companion to BillboardCity.frag -- see that file's header for
 * this scene's description.
 */
// BillboardCity.vert — a night flight down an avenue of glowing photo
// billboards; each screen shows a seeded kaleido-crop of the current image
// and pulses with its own spectrum band.  attrA.xy = corner, attrA.w = index.

in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioSpectrum[32];   ///< Spectrum bands, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

out vec2  vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec4  vSeed;   ///< Per-instance random seed (from the vertex stage).
out float vBand;
out float vFade;

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float idx = attrA.w;
    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    float camZ = time * 4.5 + audioAdvance * 16.0;
    float L    = 3000.0 / 12.5;               // one loop slot per billboard
    float z    = mod(idx * (240.0 / 3000.0) * 12.5 - camZ, 240.0) + 2.0;

    // Billboards flank an open avenue; bigger ones sit further out and up.
    float side = (r1 < 0.5) ? -1.0 : 1.0;
    float lane = 10.0 + r2 * 46.0;
    float h    = -4.0 + r3 * r3 * 40.0;
    vec2  half_ = vec2(3.0 + r4 * 5.0, 2.0 + r4 * 3.2);

    vec3 centre = vec3(side * lane, h, z);

    if (z < 1.2 || z > 110.0)                 // cull outside the visible run
    {
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
        vUV = vec2(0.0); vSeed = attrB; vBand = 0.0; vFade = 0.0;
        return;
    }

    // Screens face the oncoming camera, slightly angled toward the road.
    float yaw   = -side * 0.35;
    vec3  right = vec3(cos(yaw), 0.0, sin(yaw));
    vec2 corner = (attrA.xy - 0.5) * 2.0 * half_;
    vec3 vp = centre + right * corner.x + vec3(0.0, corner.y, 0.0);

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.06 * gl_Position.w;

    vUV   = attrA.xy;
    vSeed = attrB;
    int band = int(mod(idx, 32.0));
    vBand = audioSpectrum[band];
    vFade = clamp(1.0 - z / 110.0, 0.0, 1.0)
          * (0.75 + 0.5 * audioSwell);
}
