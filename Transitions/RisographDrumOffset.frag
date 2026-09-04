#version 330 core
out vec4 fragColor;
/**
 * @file RisographDrumOffset.frag
 * @brief TRANSITION RISOGRAPH DRUM OFFSET: the scene is printed as a two-colour
 * risograph, and the two drums are out of register.
 *
 * A riso does not mix colours, it lays one spot ink on top of another, so the
 * separation is a real one: each ink's density is its absorption in the
 * complementary channel, and the sheet is built multiplicatively -- paper times
 * ink times ink.  That is why the midtones go muddy-warm the way a real riso
 * does instead of staying neutral like a screen blend.
 *
 * The two drums drift apart over the first half of the turn and the incoming
 * image's drums come down converging, so the misregistration halo opens and
 * closes.  Both the separation and the offset are zero at the two ends of the
 * transition, so the first and last frame are the untouched scenes.
 *
 * Audio Reactivity:
 *   audioFlux      -> the paper fibre's contrast (light)
 *   audioSwell     -> how far the drums run out of register (slow)
 *   audioChromaHue -> which two spot inks are on the drums (colour)
 *   audioHigh      -> the roller streaks (light)
 *
 * Per-activation variety: inkP, misregP, hueP.
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

uniform float inkP;
uniform float misregP;
uniform float hueP;

const float PI = 3.14159265358979;

mat2 rot2D(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main()
{
    float ink    = clamp(inkP,    0.0, 1.0);
    float mis    = (misregP > 0.0) ? misregP : 1.0;
    float hue    = (hueP    > 0.0) ? hueP    : 0.0;

    float aspect = resolution.x / resolution.y;
    vec2  uv = gl_FragCoord.xy / resolution;
    vec2  p  = (uv - 0.5) * vec2(aspect, 1.0);

    float d = clamp(1.0 - interpolation, 0.0, 1.0);
    // The print itself only exists in the middle of the turn: at both ends the
    // untouched scene has to come through exactly.
    float sep  = smoothstep(0.0, 0.26, d) * (1.0 - smoothstep(0.74, 1.0, d));
    float swap = smoothstep(0.34, 0.66, d);

    // Which sheet is on the drums right now.
    vec3 baseHere = mix(texture(tex0, uv).rgb, texture(tex1, uv).rgb, swap);

    // The two drums run out of register along a fixed axis, opening widest in
    // the middle of the pass.  Only audioSwell touches this -- a fast envelope
    // on a pixel offset would read as jitter, not as a printing press.
    float ang = (hue > 0.001 ? hue : 1.05) + audioChromaHue * 0.5;
    vec2  axis = rot2D(ang) * vec2(1.0, 0.0);
    float off  = 0.0075 * mis * sep * (0.75 + 0.5 * clamp(audioSwell, 0.0, 1.0));
    vec2  offA =  axis * off / vec2(aspect, 1.0);
    vec2  offB = -axis * off / vec2(aspect, 1.0);

    vec3 sA = mix(texture(tex0, clamp(uv + offA, 0.0, 1.0)).rgb,
                  texture(tex1, clamp(uv + offA, 0.0, 1.0)).rgb, swap);
    vec3 sB = mix(texture(tex0, clamp(uv + offB, 0.0, 1.0)).rgb,
                  texture(tex1, clamp(uv + offB, 0.0, 1.0)).rgb, swap);

    // A duotone separates by CHANNEL: each ink carries the light its own
    // complementary channel is missing.  Picking two arbitrary wheel colours
    // and asking both to carry everything is what turned the sheet neutral --
    // the two densities came out equal and the inks cancelled.
    vec3 ink1 = vec3(1.00, 0.24, 0.56);      // pink drum: takes out green
    vec3 ink2 = vec3(0.00, 0.42, 0.80);      // blue drum: takes out red

    // Separation: an ink's density is how much light it has to take out of its
    // own complementary channel.
    // Two solid ink layers on top of each other take a dark picture down to
    // nothing, so the density is capped: a riso keeps paper showing through
    // even in its solids, and that is what carries the colour.
    float a1 = clamp(1.20 * (1.0 - sA.g), 0.0, 0.88);
    float a2 = clamp(1.20 * (1.0 - sB.r), 0.0, 0.88);

    // Paper, then ink on ink: multiplicative, the way a press actually works.
    vec3 paper = vec3(0.95, 0.94, 0.90);
    float fibre = noise2(p * 380.0) * 0.5 + noise2(p * 90.0) * 0.5;
    paper *= 0.90 + 0.16 * fibre * (0.6 + 0.9 * clamp(audioFlux * 2.0, 0.0, 1.0));

    // Paper is the white point: a print can never be brighter than its stock.
    // Lifting the sheet with a gain instead blew every highlight in the picture
    // to pure white, and the highlights are what the eye reads first.
    vec3 printed = paper * mix(vec3(1.0), ink1, a1) * mix(vec3(1.0), ink2, a2);
    // The drum pair itself is what varies per activation, so the whole sheet
    // turns on the wheel rather than the separation changing meaning.
    printed = hueRot(printed, ink * 6.2831853 + audioChromaHue * 0.8);

    // Roller streaks: faint horizontal bands from an uneven drum.
    float streak = noise2(vec2(p.y * 26.0, 3.7)) - 0.5;
    printed *= 1.0 + streak * 0.12 * (0.4 + 0.8 * clamp(audioHigh * 2.0, 0.0, 1.0));

    // The ink wells up at the edge of a solid, leaving a darker margin.
    float dens = max(a1, a2);
    float wellUp = clamp(fwidth(dens) * 9.0, 0.0, 1.0);
    printed *= 1.0 - 0.30 * wellUp;

    vec3 col = mix(baseHere, printed, sep);
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
