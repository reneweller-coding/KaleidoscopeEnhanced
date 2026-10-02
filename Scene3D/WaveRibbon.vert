#version 330 core
/**
 * @file WaveRibbon.vert
 * @brief Vertex stage companion to WaveRibbon.frag -- see that file's header for
 * this scene's description.
 */
// WaveRibbon.vert — the classic MilkDrop waveform, reborn in 3D: 20 stacked
// glowing wave lines drift back into space, each an "echo" of the front
// line a moment earlier.  The wave itself is a smooth harmonic sum whose
// partial amplitudes breathe with the spectrum bands — steady, no strobes.
// attrA.x = position along the line, attrA.y = side, attrA.w = line index.

in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

uniform float audioSpectrum[32];   ///< Spectrum bands, 0..1.
uniform float audioWave[64];
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
    float t  = attrA.x;                      // 0..1 along the line
    float sd = attrA.y;
    float li = attrA.w;                      // 0 = front line .. 19 = oldest

    float x  = (t - 0.5) * 56.0;

    // Echoes lag in phase — line li shows the wave as it was li*0.18 s ago.
    float tt = time - li * 0.18;
    float ph = tt * 1.1 + audioAdvance * 0.5;

    // THE REAL WAVEFORM (audioWave = the live time-domain signal), blended
    // with a smooth harmonic ghost: the front lines ARE the oscilloscope,
    // the deep echoes dissolve into the harmonic memory of it.
    float fw = clamp(t, 0.0, 1.0) * 62.999;
    int   wi = int(fw);
    float wv = mix(audioWave[wi], audioWave[wi + 1], fract(fw));

    float b1 = audioSpectrum[2],  b2 = audioSpectrum[7];
    float b3 = audioSpectrum[14], b4 = audioSpectrum[24];
    float ghost = sin(t * 6.2831853 * 1.0 + ph)        * (2.2 + 5.0 * b1)
                + sin(t * 6.2831853 * 2.0 - ph * 0.7)  * (1.2 + 4.0 * b2)
                + sin(t * 6.2831853 * 3.0 + ph * 0.53) * (0.7 + 3.0 * b3)
                + sin(t * 6.2831853 * 5.0 - ph * 0.41) * (0.35 + 2.2 * b4);

    float front = 1.0 - li / 19.0;                 // 1 front .. 0 deepest
    float y = mix(ghost, wv * 9.0, 0.25 + 0.60 * front);
    y *= 0.9 + 0.5 * audioSwell;

    // Older echoes sit deeper and drift gently upward; sd gives the line
    // its thickness (the frag shades a bright core across it).
    vec3 vp = vec3(x, y + li * 0.55 - 4.0 + sd * 0.45, 24.0 + li * 3.2);

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;

    // Hue flows along the line and back through the echoes.
    vec3 col = hueRot(vec3(0.3, 0.9, 0.9),
                      audioChromaHue + t * 1.6 + li * 0.22);
    col *= (1.0 - li / 22.0);                // echoes fade
    col *= 0.8 + 0.5 * audioSwell;

    vCol  = vec4(col * 1.5, 1.0);
    vSide = sd;
}
