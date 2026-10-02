#version 330 core
/**
 * @file SynthTerrain.vert
 * @brief Vertex stage companion to SynthTerrain.frag -- see that file's header for
 * this scene's description.
 */
// SynthTerrain.vert — a synthwave wireframe terrain flythrough: the camera
// glides down a valley between mountain ridges whose heights ride the 32
// spectrum bands.  The grid mesh (attrA.xy = u/v) is displaced here; the
// fragment shader draws the glowing grid lines.

in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioSpectrum[32];   ///< Spectrum bands, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioDrop;   ///< Drop envelope: high after a detected drop, decaying.
uniform float audioBeatPhase;   ///< Position within the current beat, 0..1.

out vec3  vWorld;    ///< x, zAbs, height (for the fragment grid lines)
out float vDist;   ///< Distance (from the vertex stage).

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float u = attrA.x, v = attrA.y;

    float camZ = time * 7.0 + audioAdvance * 16.0;
    float x    = (u - 0.5) * 180.0;
    float zRel = v * 260.0 + 2.0;
    float zAbs = zRel + camZ;

    // Valley profile: flat corridor, MASSIVE ridges toward the sides — the
    // ridge height rides the spectrum band of its |x| position.  Structure
    // frequencies are LOW (big smooth mountains); the old high-frequency
    // micro-noise term is gone — it aliased against the grid and read as
    // pixelated trembling.
    float base = pow(abs(x) / 90.0, 1.6) * 40.0;
    float wave = 0.55 + 0.45 * sin(zAbs * 0.028 + x * 0.04)
                             * sin(zAbs * 0.013 - x * 0.027);
    int   band = int(clamp(abs(x) / 90.0 * 31.0, 0.0, 31.0));
    float h    = base * wave * (1.0 + 0.9 * audioSpectrum[band])
               * (1.0 + 0.15 * audioSwell);
    // Mid-frequency relief: smooth extra detail so the ridges stop
    // reading as bare low-poly facets (no aliasing micro-noise).
    h += (sin(zAbs * 0.055 + x * 0.085) * 1.6 + sin(zAbs * 0.031 - x * 0.047) * 2.3)
       * wave * clamp(abs(x) / 40.0, 0.0, 1.0);

    // KICK QUAKE: every kick rolls a ground shockwave down the valley
    // toward the camera; a DROP ruptures the whole terrain upward once.
    float qz = fract(zAbs * 0.012 - audioBeatPhase);
    h += 3.5 * audioKick * exp(-qz * 9.0) * (0.3 + 0.7 * abs(sin(x * 0.15)));
    h += 6.0 * audioDrop * exp(-abs(x) * 0.04) * sin(zAbs * 0.10);

    // CAMERA: banking low-level flight — swings across the valley and rolls
    // into the turns instead of gliding straight down the middle.
    float swing = sin(time * 0.11) * 13.0;
    float roll  = -cos(time * 0.11) * 0.14;
    vec3 vp = vec3(x - swing, h - 9.5 + sin(time * 0.23) * 1.2, zRel);
    vp.xy = mat2(cos(roll), -sin(roll), sin(roll), cos(roll)) * vp.xy;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    vWorld = vec3(x, zAbs, h);
    vDist  = zRel;
}
