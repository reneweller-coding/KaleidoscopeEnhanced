#version 330 core
out vec4 fragColor;
/**
 * @file GalaxyCollision.frag
 * @brief Displays the compute N-body simulation of two colliding galaxies (32k gravitating bodies) as a star field with a tight stellar glow and a wide galactic haze.
 *
 * texNBody holds the simulated star field; this pass adds a two-scale halo, a near one for star glow and a far one for galactic dust haze, and grades the result. audioSubBass widens the far halo and pulses the whole field like a slow breath, audioBeat adds to that pulse, and audioDrop flashes the star cores white-hot on a drop. The photo appears only as a heavily darkened deep-space backdrop showing through the sparser regions.
 */
// GalaxyCollision.frag — 32k gravitating bodies from the compute N-body sim.
// Star fields need the opposite grading from a fluid: tiny bright points with
// long soft halos, so the bloom here is wide and the core is left sharp.

uniform sampler2D tex0;
uniform sampler2D texNBody;      // <- requests the N-body sim
uniform vec2  resolution;
uniform float time;
uniform float interpolation;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioKick;
uniform float audioSubBass;
uniform float audioChromaHue;
uniform float audioDrop;

uniform float glowP;             // preset: halo width
uniform float dustP;             // preset: interstellar dust haze

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    vec3 core = texture(texNBody, uv).rgb;

    // Two-scale halo: a tight one for the star glow, a wide one for the
    // galactic haze.  Both cheap ring taps, no separable blur needed.
    vec3 near = vec3(0.0), far = vec3(0.0);
    float r1 = 0.004 + 0.004 * glowP;
    float r2 = 0.030 + 0.045 * glowP + 0.02 * audioSubBass;
    for (int i = 0; i < 8; ++i)
    {
        float t = float(i) * 0.7854;
        vec2 d = vec2(cos(t), sin(t));
        near += texture(texNBody, uv + d * r1).rgb;
        far  += texture(texNBody, uv + d * r2).rgb;
    }
    near /= 8.0; far /= 8.0;

    vec3 col = core + near * 0.55 + far * (0.22 + 0.30 * dustP);

    // Sub-bass makes the whole field pulse like a slow breath.
    col *= 1.0 + 0.30 * audioSubBass + 0.20 * audioBeat;

    // A drop flashes the core white-hot.
    col += near * audioDrop * 1.2;

    // The sim already assigns physically motivated star colours; only a light
    // touch here, otherwise the two gradings fight and the arms turn garish.
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col *= mix(vec3(0.88, 0.94, 1.10), vec3(1.06, 1.00, 0.94),
               clamp(lum * 1.4, 0.0, 1.0));

    col = col / (1.0 + col * 0.40);

    // Deep-space backdrop from the photo, heavily darkened.
    vec3 photo = texture(tex0, uv).rgb;
    col += photo * photo * photo * 0.10 * (1.0 - clamp(lum, 0.0, 1.0));

    fragColor = vec4(col, interpolation);
}
