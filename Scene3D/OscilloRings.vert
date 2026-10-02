#version 330 core
/**
 * @file OscilloRings.vert
 * @brief Vertex stage companion to OscilloRings.frag -- see that file's header for
 * this scene's description.
 */
// OscilloRings.vert — 20 nested oscilloscope rings floating on a tilted
// plane; every ring undulates radially with its own spectrum band and its
// own harmonic mode, all of it slow and continuous.
// attrA.x = angle around the ring, attrA.y = side, attrA.w = ring index.

in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

uniform float audioSpectrum[32];   ///< Spectrum bands, 0..1.
uniform float audioWave[64];
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).

out vec4  vCol;   ///< Colour (from the vertex stage).
out float vSide;   ///< Which side of a strip (from the vertex stage).

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float t  = attrA.x;
    float sd = attrA.y;
    float ri = attrA.w;                      // ring 0 (inner) .. 19 (outer)

    float ang  = t * 6.2831853;
    int   band = int(mod(ri * 1.6, 32.0));
    float lvl  = audioSpectrum[band];

    // Base radius breathes with the bass; the ring's own band adds a
    // smooth m-lobed undulation, and the REAL waveform is bent around the
    // innermost rings — a true circular oscilloscope.
    float mode = 3.0 + mod(ri, 4.0);
    float fw = t * 62.999;
    int   wi = int(fw);
    float wv = mix(audioWave[wi], audioWave[wi + 1], fract(fw));
    float R = (3.5 + ri * 1.55) * (1.0 + 0.05 * audioBass)
            + sin(ang * mode + time * 0.7 + ri * 0.9
                  + audioAdvance * 0.4) * (0.25 + 2.6 * lvl)
            + wv * 1.5 * exp(-ri * 0.30);

    // Tilted disc, slowly turning as a whole; sd = radial line thickness.
    float spin = time * 0.06 + audioAdvance * 0.10;
    vec2  p    = vec2(cos(ang + spin), sin(ang + spin))
               * (R + sd * (0.30 + R * 0.018));
    float tilt = 0.95;
    vec3 vp = vec3(p.x,
                   p.y * cos(tilt) - 2.0,
                   p.y * sin(tilt) + 40.0);

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;

    vec3 col = hueRot(vec3(0.2, 0.85, 0.75),
                      audioChromaHue + ri * 0.28);
    col *= (0.45 + 1.8 * lvl + 0.35 * audioSwell)
         * (1.0 - ri / 30.0);

    vCol  = vec4(col * 1.5, 1.0);
    vSide = sd;
}
