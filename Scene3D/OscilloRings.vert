#version 330 core
// OscilloRings.vert — 20 nested oscilloscope rings floating on a tilted
// plane; every ring undulates radially with its own spectrum band and its
// own harmonic mode, all of it slow and continuous.
// attrA.x = angle around the ring, attrA.y = side, attrA.w = ring index.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioSpectrum[32];
uniform float audioWave[64];
uniform float audioBass;
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
