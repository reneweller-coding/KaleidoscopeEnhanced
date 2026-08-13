#version 330 core
// WaveRibbon.vert — the classic MilkDrop waveform, reborn in 3D: 20 stacked
// glowing wave lines drift back into space, each an "echo" of the front
// line a moment earlier.  The wave itself is a smooth harmonic sum whose
// partial amplitudes breathe with the spectrum bands — steady, no strobes.
// attrA.x = position along the line, attrA.y = side, attrA.w = line index.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioSpectrum[32];
uniform float audioWave[64];
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioAdvance;

out vec4  vCol;
out float vSide;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

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
