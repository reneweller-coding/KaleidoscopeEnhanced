#version 330 core
out vec4 fragColor;
/**
 * @file ChromatophoreSkinWave.frag
 * @brief TRANSITION CHROMATOPHORE SKIN WAVE: the picture changes the way
 * squid skin does -- thousands of pigment sacs open, each one a round dot that
 * takes its colour from the incoming scene, with waves of muscle running across
 * the field.
 *
 * A chromatophore is not a pixel that fades.  It is a pigment sac pulled open
 * by radial muscles, so it OPENS: a small dot becomes a large one, and the
 * colour it shows is the pigment it already held.  That is why each dot here
 * grows rather than brightens, and why its colour is sampled once at the sac's
 * own centre instead of per pixel -- the skin is a mosaic of whole sacs, not a
 * resampling of a picture.
 *
 * The waves matter as much as the dots.  Cuttlefish and squid run travelling
 * bands of activation across the mantle, so the sacs do not open all together;
 * a band sweeps and the pattern arrives behind it.
 *
 * Audio Reactivity:
 *   audioMid     -> the wavelength of the muscle wave (slow)
 *   audioSwell   -> how far the sacs open (slow)
 *   audioAdvance -> the wave travels, continuously
 *   audioHigh    -> the iridophores under the sacs (light)
 *
 * Per-activation variety: densityP, waveP, hueP.
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;
uniform float audioChromaHue;

uniform float densityP;
uniform float waveP;
uniform float hueP;

const float PI = 3.14159265358979;

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main()
{
    float dens = 13.0 + floor(clamp(densityP, 0.0, 1.0) * 15.0);   // rolled ONCE
    float wav  = (waveP > 0.0) ? waveP : 1.0;
    float hue  = (hueP  > 0.0) ? hueP  : 0.0;

    float aspect = resolution.x / resolution.y;
    vec2  uv = gl_FragCoord.xy / resolution;
    vec2  p  = (uv - 0.5) * vec2(aspect, 1.0);

    float d   = clamp(1.0 - interpolation, 0.0, 1.0);
    float arc = sin(d * PI);

    // The travelling band of activation.
    float k = (2.6 + 3.0 * clamp(audioMid * 2.0, 0.0, 1.0)) / wav;
    vec2  wdir = normalize(vec2(0.82, 0.34));
    float act = 0.5 + 0.5 * sin(dot(p, wdir) * k - audioAdvance * 0.09);

    vec3 skin = texture(tex0, uv).rgb;

    float cell = 1.0 / dens;
    vec2  gi = floor(p / cell);

    float best = 0.0;              // how far into a sac this pixel is
    vec3  pigment = vec3(0.0);
    float irid = 0.0;
    for (int j = -1; j <= 1; ++j)
    for (int i = -1; i <= 1; ++i)
    {
        vec2 id = gi + vec2(float(i), float(j));
        vec2 jit = vec2(hash21(id + 1.7), hash21(id + 6.3)) - 0.5;
        vec2 c = (id + 0.5 + jit * 0.72) * cell;
        // Each sac opens a little before or after its neighbours, and the wave
        // decides by how much.  The opening itself is one smooth ramp.
        float own = hash21(id + 14.9);
        float when = 0.34 * own + 0.30 * (1.0 - act);
        float open = smoothstep(when, when + 0.42, d)
                   * (0.75 + 0.35 * clamp(audioSwell, 0.0, 1.0));
        // A relaxed sac is a small dark point; a pulled-open one is wide.
        // Closed means closed: a relaxed sac has no radius at all at the
        // start of the turn, or the first frame is already a mosaic.
        float r = cell * (0.10 + 0.78 * clamp(open, 0.0, 1.0))
                * smoothstep(0.0, 0.05, d);
        // A radius of exactly zero would make the smoothstep below a
        // smoothstep(0, 0, x) -- a division by zero, and the sac swallows the
        // whole frame instead of vanishing.  A closed sac is simply skipped.
        if (r <= 1e-5) continue;
        float dist = length(p - c);
        // Round and soft-edged, always.
        float ins = smoothstep(r, r * 0.72, dist);
        if (ins > best)
        {
            best = ins;
            // The pigment the sac holds: sampled once, at the sac's centre.
            vec2 cuv = clamp(c / vec2(aspect, 1.0) + 0.5, 0.0, 1.0);
            pigment = textureLod(tex1, cuv, 0.0).rgb;
            irid = hash21(id + 27.1);
        }
    }

    // Iridophores under the sacs: a thin structural sheen.
    vec3 sheen = mix(vec3(0.55, 0.85, 0.95), vec3(0.95, 0.75, 0.55), irid);
    vec3 sac = pigment * (0.88 + 0.26 * irid);
    sac += sheen * (0.05 + 0.20 * clamp(audioHigh * 2.0, 0.0, 1.0)) * arc * (1.0 - irid * 0.5);

    vec3 col = mix(skin, sac, best);
    // The sacs cannot tile the plane, so the last of the skin goes at the end.
    col = mix(col, texture(tex1, uv).rgb, smoothstep(0.86, 1.0, d));

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
