#version 330 core
out vec4 fragColor;
/**
 * @file TapeHeadCrossfade.frag
 * @brief TRANSITION TAPE HEAD CROSSFADE: a splice runs across the playback
 * head.  The cut is diagonal, the transport wows, and the join gives a bump as
 * it passes.
 *
 * A tape splice is cut at an angle on purpose: a square cut would put the whole
 * width across the head in one instant and click, while a diagonal one crosses
 * it progressively and the join is inaudible.  So the boundary here is a
 * diagonal, and it travels at a steady rate the way tape does.
 *
 * The other half is the transport.  Wow is the slow speed error of an
 * eccentric capstan and flutter is the fast one, so the picture is stretched
 * along the direction of travel by a sum of two rates, one slow and one fast --
 * and because it is a SPEED error, what it bends is the position, continuously,
 * never in a step.
 *
 * Audio Reactivity:
 *   audioSwell   -> the wow: how far the transport drifts (slow)
 *   audioFlux    -> the tape hiss (light)
 *   audioHigh    -> the head bump as the join passes (light)
 *   audioMid     -> the tape's own colour (colour)
 *
 * Per-activation variety: angleP, wowP, hueP.
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

uniform float angleP;
uniform float wowP;
uniform float hueP;

const float PI = 3.14159265358979;

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main()
{
    float ang = clamp(angleP, 0.0, 1.0);
    float wow = (wowP > 0.0) ? wowP : 1.0;
    float hue = (hueP > 0.0) ? hueP : 0.0;

    float aspect = resolution.x / resolution.y;
    vec2  uv = gl_FragCoord.xy / resolution;
    vec2  p  = (uv - 0.5) * vec2(aspect, 1.0);

    float d   = clamp(1.0 - interpolation, 0.0, 1.0);
    float arc = sin(d * PI);

    // The tape runs left to right; the splice is cut at an angle across it.
    float slant = mix(0.45, 1.25, ang);
    float along = p.x + p.y * slant;
    float halfW = (aspect + slant) * 0.5 + 0.05;
    float splice = mix(-halfW - 0.05, halfW + 0.05, d);

    // Wow and flutter: a slow speed error and a fast one, integrated into the
    // position.  It is a SPEED error, so what it moves is where the tape is.
    // Only a slow envelope may scale a DISPLACEMENT: a fast one on a position
    // is picture shimmer, not tape wow.
    float amp = 0.020 * wow * arc * (0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    float shift = amp * (sin(audioAdvance * 0.20 + p.y * 0.6)
                       + 0.35 * sin(audioAdvance * 1.35 + p.y * 2.1));
    vec2 suv = clamp(uv + vec2(shift / aspect, 0.0), 0.0, 1.0);

    // The join itself: narrow, and the two sides are exactly the two scenes.
    float cross_ = smoothstep(splice + 0.045, splice - 0.045, along);
    vec3 col = mix(texture(tex0, suv).rgb, texture(tex1, suv).rgb, cross_);

    // The splice tape is slightly opaque and leaves a thin line.
    float join = exp(-pow((along - splice) / 0.030, 2.0));
    col *= 1.0 - join * 0.35 * arc;
    // The head bump: the join lifts the tape off the head for an instant.
    col += vec3(0.92, 0.90, 0.84) * join * arc
         * (0.10 + 0.34 * clamp(audioHigh * 2.0, 0.0, 1.0)
                 + 0.20 * clamp(audioSubBass, 0.0, 1.0));

    // Oxide: the tape's own colour and its hiss.
    vec3 oxide = mix(vec3(1.03, 0.99, 0.93), vec3(0.96, 0.99, 1.04), fract(hue * 0.159));
    col *= mix(vec3(1.0), oxide, arc * (0.4 + 0.6 * clamp(audioMid * 2.0, 0.0, 1.0)));
    float hiss = hash21(floor(uv * resolution.y * 0.6) + floor(audioAdvance * 6.0)) - 0.5;
    col += vec3(hiss) * 0.035 * arc * (0.5 + 1.2 * clamp(audioFlux * 2.0, 0.0, 1.0));

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
