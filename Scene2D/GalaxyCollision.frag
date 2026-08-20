#version 330 core
out vec4 fragColor;
/**
 * @file GalaxyCollision.frag
 * @brief Displays the compute N-body simulation of two colliding galaxies (32k gravitating bodies) as a star field with a tight stellar glow and a wide galactic haze.
 *
 * texNBody holds the simulated star field; this pass adds a two-scale halo, a near one for star glow and a far one for galactic dust haze, and grades the result. The photo appears only as a heavily darkened deep-space backdrop showing through the sparser regions.
 *
 * Audio Reactivity:
 *  - audioSubBass -> widens the far halo and pulses the whole field like a slow breath
 *  - audioBeat    -> adds to that pulse
 *  - audioDrop    -> flashes the star cores white-hot on a drop
 *  - audioSpread  -> DUST DISPERSION: a narrow spectrum keeps the galactic haze tight
 *                    around the arms, a wide, harmonically rich one lets it sprawl far
 *                    out into intergalactic space
 *  - audioRolloff -> STELLAR COLOUR TEMPERATURE: bass-bound music reddens the field
 *                    into old giants, energy reaching into the highs turns it into
 *                    blue-hot young stars
 *  - audioTrebRel -> STAR-GLOW PUNCH: the tight halo's weight rides the treble's
 *                    instant/slow-average ratio, so cymbals and shimmer make the
 *                    individual stars flare and a dull passage lets them recede
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
uniform float audioSpread;      // 0=narrow spectrum .. 1=wide -> dust-haze dispersion
uniform float audioRolloff;     // 0=bass-bound .. 1=reaching into the highs -> star colour
uniform float audioTrebRel;     // 0..2.5, ~1 = "as loud as usual" -> star-glow punch

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
    // Spectral spread = how far the dust sprawls: a pure, narrow spectrum keeps
    // the haze hugging the arms, rich broadband material scatters it outward.
    float r2 = 0.030 + 0.045 * glowP + 0.02 * audioSubBass
             + 0.024 * clamp(audioSpread, 0.0, 1.0);
    for (int i = 0; i < 8; ++i)
    {
        float t = float(i) * 0.7854;
        vec2 d = vec2(cos(t), sin(t));
        near += texture(texNBody, uv + d * r1).rgb;
        far  += texture(texNBody, uv + d * r2).rgb;
    }
    near /= 8.0; far /= 8.0;

    // The tight star glow rides the treble's instant/slow-average ratio, so the
    // individual stars flare on shimmer and recede in dull passages.  Modulates
    // the EXISTING halo weight (0.33..0.77 around 0.55), no new light added.
    float glowPunch = 0.55 + 0.22 * clamp(audioTrebRel - 1.0, -1.0, 1.0);

    vec3 col = core + near * glowPunch + far * (0.22 + 0.30 * dustP);

    // Sub-bass makes the whole field pulse like a slow breath.
    col *= 1.0 + 0.30 * audioSubBass + 0.20 * audioBeat;

    // A drop flashes the core white-hot.
    col += near * audioDrop * 1.2;

    // The sim already assigns physically motivated star colours; only a light
    // touch here, otherwise the two gradings fight and the arms turn garish.
    // Spectral rolloff biases that grading: bass-bound music pushes the whole
    // field toward old red giants, energy reaching into the highs toward
    // blue-hot young stars.
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    float temp = clamp(lum * 1.4 + (0.5 - clamp(audioRolloff, 0.0, 1.0)) * 0.55,
                       0.0, 1.0);
    col *= mix(vec3(0.88, 0.94, 1.10), vec3(1.06, 1.00, 0.94), temp);

    col = col / (1.0 + col * 0.40);

    // Deep-space backdrop from the photo, heavily darkened.
    vec3 photo = texture(tex0, uv).rgb;
    col += photo * photo * photo * 0.10 * (1.0 - clamp(lum, 0.0, 1.0));

    fragColor = vec4(col, interpolation);
}
