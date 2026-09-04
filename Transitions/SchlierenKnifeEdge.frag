#version 330 core
out vec4 fragColor;
/**
 * @file SchlierenKnifeEdge.frag
 * @brief TRANSITION SCHLIEREN KNIFE EDGE: a knife edge travels across the frame
 * and, in the band around it, the difference between the two scenes shows up
 * the way a schlieren system shows air: as brightness on one side of every
 * gradient and darkness on the other.
 *
 * A schlieren system does not image density, it images the DERIVATIVE of
 * density along the knife: light bent toward the knife is blocked and goes
 * dark, light bent away misses it and goes bright.  So the field here is the
 * difference between the outgoing and the incoming scene -- the thing that is
 * actually changing -- and what is drawn is that field's gradient projected on
 * the knife direction, against the mid-grey of an undisturbed beam.  Drawing
 * the difference itself would give a ghost image, not schlieren.
 *
 * Everything happens in a band that travels with the knife, so the frame is the
 * outgoing scene ahead of it and the incoming scene behind it, and both ends of
 * the turn are the untouched scenes.
 *
 * Audio Reactivity:
 *   audioFlux  -> the gradient gain, i.e. how violent the flow reads (light)
 *   audioMid   -> the knife's angle (slow)
 *   audioHigh  -> the beam's sparkle in the band (light)
 *   audioSwell -> the width of the band (slow)
 *
 * Per-activation variety: gainP, bandP, hueP.
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

uniform float gainP;
uniform float bandP;
uniform float hueP;

const float PI = 3.14159265358979;

mat2 rot2D(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main()
{
    float gain = (gainP > 0.0) ? gainP : 1.0;
    float bw   = (bandP > 0.0) ? bandP : 1.0;
    float hue  = (hueP  > 0.0) ? hueP  : 0.0;

    float aspect = resolution.x / resolution.y;
    vec2  uv = gl_FragCoord.xy / resolution;
    vec2  p  = (uv - 0.5) * vec2(aspect, 1.0);
    float halfW = aspect * 0.5;

    float d = clamp(1.0 - interpolation, 0.0, 1.0);

    // The knife travels far enough past both edges that the band is off-frame
    // at both ends of the turn.
    // A schlieren window is a WINDOW: at 0.30 it covered the whole frame and
    // the transition read as a grey wash instead of a travelling band.
    float width = (0.11 + 0.05 * clamp(audioSwell, 0.0, 1.0)) * bw;
    float kx = mix(-halfW - width * 2.2, halfW + width * 2.2, d);

    // Ahead of the knife the outgoing scene, behind it the incoming one.
    float passed = smoothstep(kx + width * 0.7, kx - width * 0.7, p.x);
    vec3  base = mix(texture(tex0, uv).rgb, texture(tex1, uv).rgb, passed);

    // The schlieren field: what is CHANGING between the two scenes.
    vec2 px = 1.5 / resolution;
    float f  = lum(texture(tex1, uv).rgb) - lum(texture(tex0, uv).rgb);
    float fx = (lum(texture(tex1, clamp(uv + vec2(px.x, 0.0), 0.0, 1.0)).rgb)
              - lum(texture(tex0, clamp(uv + vec2(px.x, 0.0), 0.0, 1.0)).rgb))
             - (lum(texture(tex1, clamp(uv - vec2(px.x, 0.0), 0.0, 1.0)).rgb)
              - lum(texture(tex0, clamp(uv - vec2(px.x, 0.0), 0.0, 1.0)).rgb));
    float fy = (lum(texture(tex1, clamp(uv + vec2(0.0, px.y), 0.0, 1.0)).rgb)
              - lum(texture(tex0, clamp(uv + vec2(0.0, px.y), 0.0, 1.0)).rgb))
             - (lum(texture(tex1, clamp(uv - vec2(0.0, px.y), 0.0, 1.0)).rgb)
              - lum(texture(tex0, clamp(uv - vec2(0.0, px.y), 0.0, 1.0)).rgb));

    // The knife's own direction decides which component is cut off.
    float knife = 1.05 + 0.9 * (clamp(audioMid * 2.0, 0.0, 1.0) - 0.5);
    vec2  kdir = vec2(cos(knife), sin(knife));
    float deflect = dot(vec2(fx, fy), kdir) * 15.0 * gain
                  * (0.7 + 0.9 * clamp(audioFlux * 2.0, 0.0, 1.0));

    // An undisturbed beam is mid-grey; the deflection takes it up or down.
    vec3 beam = vec3(0.44, 0.45, 0.49) * (1.0 + clamp(deflect, -0.90, 1.10));
    // A schlieren image keeps a trace of the flow's own body, faintly.
    beam += vec3(0.10, 0.12, 0.16) * clamp(abs(f) * 1.4, 0.0, 1.0);
    // The beam is never perfectly clean.
    beam *= 0.94 + 0.10 * hash21(floor(uv * resolution.y * 0.35));
    beam += vec3(0.8, 0.85, 1.0) * clamp(deflect, 0.0, 1.0)
          * 0.10 * clamp(audioHigh * 2.0, 0.0, 1.0);

    float band = exp(-pow((p.x - kx) / width, 2.0));
    vec3 col = mix(base, beam, clamp(band, 0.0, 1.0));

    // The knife itself: a hard dark edge at the focal plane.
    col *= 1.0 - 0.55 * exp(-pow((p.x - kx) / (width * 0.10), 2.0));

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
