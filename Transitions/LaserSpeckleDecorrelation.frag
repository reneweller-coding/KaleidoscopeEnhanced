#version 330 core
out vec4 fragColor;
/**
 * @file LaserSpeckleDecorrelation.frag
 * @brief TRANSITION LASER SPECKLE DECORRELATION: a coherent speckle field lies
 * over the outgoing scene, decorrelates until the picture is buried in grain,
 * and correlates again onto the incoming scene.
 *
 * Speckle is not noise sprinkled on an image.  It is the intensity of a sum of
 * randomly phased waves, so it is built here the way it forms: eight plane
 * waves with random directions and phases, summed as a complex amplitude, and
 * the intensity is that amplitude squared.  That is what gives speckle its
 * characteristic look -- elongated bright grains with genuinely black gaps and
 * the long bright tail of a negative-exponential distribution, which additive
 * noise never has.
 *
 * The decorrelation is real too: the phases travel from one random set to
 * another across the turn, so grains dissolve and re-form instead of
 * cross-fading.  And because the field MULTIPLIES the picture, the way a
 * laser's speckle actually modulates what it lights, the scene stays under the
 * grain instead of being covered by it.
 *
 * Audio Reactivity:
 *   audioHigh    -> the grain size (light, structure)
 *   audioSwell   -> how deep the grain bites (slow)
 *   audioAdvance -> the field boils slowly and continuously
 *   audioKick    -> the brightest grains flare (light)
 *
 * Per-activation variety: grainP, biteP, hueP.
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

uniform float grainP;
uniform float biteP;
uniform float hueP;

const float PI = 3.14159265358979;

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

void main()
{
    float grain = (grainP > 0.0) ? grainP : 1.0;
    float bite  = (biteP  > 0.0) ? biteP  : 1.0;
    float hue   = (hueP   > 0.0) ? hueP   : 0.0;

    float aspect = resolution.x / resolution.y;
    vec2  uv = gl_FragCoord.xy / resolution;
    vec2  p  = (uv - 0.5) * vec2(aspect, 1.0);

    float d   = clamp(1.0 - interpolation, 0.0, 1.0);
    float arc = sin(d * PI);

    // Grain size: a bigger aperture makes finer speckle.
    float k0 = (90.0 + 130.0 * clamp(audioHigh * 2.0, 0.0, 1.0)) / max(grain, 0.2);

    // Eight plane waves, their phases travelling from one random set to
    // another across the turn.  That travel IS the decorrelation.
    float re = 0.0, im = 0.0;
    for (int i = 0; i < 16; ++i)
    {
        float fi = float(i);
        float a0 = hash11(fi * 3.17 + 0.5) * 6.2831853;

        // Each wave keeps its own direction; only the phase travels, which is
        // what makes grains dissolve in place instead of sliding across.
        vec2  kv = vec2(cos(a0), sin(a0)) * k0 * (0.72 + 0.55 * hash11(fi * 1.9));
        float ph0 = hash11(fi * 11.3 + 1.1) * 6.2831853;
        float ph1 = hash11(fi * 5.53 + 4.7) * 6.2831853;
        float ph  = mix(ph0, ph1, d)
                  + audioAdvance * 0.03 * (0.5 + hash11(fi * 2.7));
        float s = dot(p, kv) + ph;
        re += cos(s);
        im += sin(s);
    }
    // Intensity of the summed amplitude, normalised so its mean is about one.
    float I = (re * re + im * im) / 16.0;

    vec3 col = mix(texture(tex0, uv).rgb, texture(tex1, uv).rgb, d);

    // Speckle MULTIPLIES what it lights.  Mixing toward the field by the arc
    // keeps both ends of the turn exactly the untouched scenes.
    // The grain has to leave the picture readable: at 0.85 the scene was gone
    // and the turn read as static, not as a laser lighting something.
    float depth = 0.42 * arc * bite * (0.6 + 0.5 * clamp(audioSwell, 0.0, 1.0));
    col *= mix(1.0, clamp(I, 0.0, 3.2), depth);

    // The brightest grains are where the waves all agree; those flare.
    float hot = clamp(I - 2.1, 0.0, 1.4);
    col += vec3(0.85, 0.90, 1.0) * hot * arc * (0.04 + 0.13 * clamp(audioKick, 0.0, 1.0));

    // A laser is one colour; the field pulls the picture toward it mid-turn.
    vec3 laser = vec3(0.95, 0.35, 0.42);
    laser = mix(laser, vec3(0.35, 0.95, 0.55), fract(hue * 0.159));
    col = mix(col, col * laser * 1.5, 0.18 * arc);

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
