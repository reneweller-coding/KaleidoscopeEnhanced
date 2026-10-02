#version 330 core
/**
 * @file GalleryHall.vert
 * @brief Vertex stage companion to GalleryHall.frag -- see that file's header for
 * this scene's description.
 */
// GalleryHall.vert — an endless museum corridor at night: framed pictures
// on both walls, each a different crop of the current image.  The camera
// strolls forward with the music; the picture nearest the camera lights up
// with the beat.  attrA.xy = quad corner, attrA.w = quad index.
//
// Quad budget: index < 300 -> 150 frames per wall side; the rest of the
// 3000 quads become faint ceiling light strips.

in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioBeatPhase;   ///< Position within the current beat, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

out vec2  vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec4  vSeed;   ///< Per-instance random seed (from the vertex stage).
out float vLight;
out float vKind;                          ///< 0 = picture, 1 = light strip

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float idx  = attrA.w;
    float camZ = time * 2.2 + audioAdvance * 9.0;

    vec3  centre;
    vec2  half_;
    float side;

    if (idx < 300.0)
    {
        // Framed pictures: 150 per wall, looping every 12 units.
        side = (mod(idx, 2.0) < 1.0) ? -1.0 : 1.0;
        float slot = floor(idx / 2.0);
        float L    = 150.0 * 12.0;
        float z    = mod(slot * 12.0 - camZ, L) + 2.0;

        centre = vec3(side * 9.0, 1.5, z);
        half_  = vec2(3.4, 2.5);
        vKind  = 0.0;

        // The nearest picture pulses with the beat.
        float near_ = exp(-abs(z - 7.0) * 0.22);
        vLight = 0.65 + 0.55 * near_
               * (0.6 + 0.4 * sin(6.2831853 * audioBeatPhase));
    }
    else if (idx < 600.0)
    {
        // Ceiling light strips every 12 units.
        float slot = idx - 300.0;
        float L    = 300.0 * 12.0;
        float z    = mod(slot * 12.0 - camZ, L) + 2.0;
        centre = vec3(0.0, 7.5, z);
        half_  = vec2(1.4, 0.35);
        side   = 0.0;
        vKind  = 1.0;
        vLight = 0.8 + 0.4 * audioSwell;
    }
    else
    {
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
        vUV = vec2(0.0); vSeed = attrB; vLight = 0.0; vKind = 1.0;
        return;
    }

    if (centre.z < 1.0 || centre.z > 90.0)    // cull whole quad outside view
    {
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
        vUV = vec2(0.0); vSeed = attrB;
        return;
    }

    vec2 corner = (attrA.xy - 0.5) * 2.0 * half_;
    // Pictures hang flat on the wall (facing inward); strips face down.
    vec3 vp;
    if (vKind < 0.5)
        vp = centre + vec3(0.0, corner.y, -side * corner.x);
    else
        vp = centre + vec3(corner.x, 0.0, corner.y * 4.0);

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;

    vUV   = attrA.xy;
    vSeed = attrB;
}
