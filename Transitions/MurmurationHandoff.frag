#version 330 core
out vec4 fragColor;
/**
 * @file MurmurationHandoff.frag
 * @brief TRANSITION MURMURATION HANDOFF: a starling flock lifts off the
 * outgoing scene and settles as the incoming one.
 *
 * The picture is carried by the flock's DENSITY, not by any bird's position.
 * A bird is a bird -- a small round speck with a soft edge -- and it exists at
 * all only where the target picture is dark enough to want one.  That is what
 * lets a murmuration hold a shape while every individual keeps moving: nothing
 * has to be placed, only counted.  Painting the picture onto the birds instead
 * would make the flock a texture, and it would flicker as birds crossed edges.
 *
 * Every bird drifts on the same slowly turning flow field with its own offset,
 * so the whole cloud shears and folds the way a real flock does, continuously,
 * with nothing jumping at any point in the turn.
 *
 * Audio Reactivity:
 *   audioSwell   -> the flock's cohesion: how tightly it holds the shape (slow)
 *   audioHigh    -> the flash of wings turning over (light)
 *   audioAdvance -> the flow field turns, continuously
 *   audioMid     -> the sky's own light (colour)
 *
 * Per-activation variety: birdsP, flowP, hueP.
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

uniform float birdsP;
uniform float flowP;
uniform float hueP;

const float PI = 3.14159265358979;

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main()
{
    float birds = 16.0 + floor(clamp(birdsP, 0.0, 1.0) * 16.0);   // rolled ONCE
    float flow  = (flowP > 0.0) ? flowP : 1.0;
    float hue   = (hueP  > 0.0) ? hueP  : 0.0;

    float aspect = resolution.x / resolution.y;
    vec2  uv = gl_FragCoord.xy / resolution;
    vec2  p  = (uv - 0.5) * vec2(aspect, 1.0);

    float d   = clamp(1.0 - interpolation, 0.0, 1.0);
    float arc = sin(d * PI);

    // The sky the flock is seen against.
    vec3 sky = mix(texture(tex0, uv).rgb, texture(tex1, uv).rgb, d);
    sky *= 1.0 - 0.14 * arc;                       // birds darken the air a little
    sky = mix(sky, sky * vec3(1.02, 1.00, 0.96), clamp(audioMid * 2.0, 0.0, 1.0) * 0.4);

    // The flow the whole cloud rides, turning slowly.
    float turn = audioAdvance * 0.035;
    vec2 fl = vec2(noise2(p * 1.5 + vec2(turn, 0.0)) - 0.5,
                   noise2(p * 1.5 + vec2(0.0, turn) + 21.7) - 0.5) * 0.55 * flow;

    // Cohesion: how closely the flock reproduces the target's density.
    float coh = 0.55 + 0.45 * clamp(audioSwell, 0.0, 1.0);

    float cell = 1.0 / birds;
    vec2  gi = floor((p + fl) / cell);

    float mask = 0.0, wing = 0.0;
    for (int j = -1; j <= 1; ++j)
    for (int i = -1; i <= 1; ++i)
    {
        vec2 id = gi + vec2(float(i), float(j));
        vec2 jit = vec2(hash21(id + 3.9), hash21(id + 11.1)) - 0.5;
        // Each bird holds its own offset within the moving field.
        vec2 c = (id + 0.5 + jit * 0.9) * cell - fl;
        // Whether there is a bird here at all is decided by the picture the
        // flock is currently holding.
        vec2 cuv = clamp(c / vec2(aspect, 1.0) + 0.5, 0.0, 1.0);
        float want = 1.0 - lum(mix(textureLod(tex0, cuv, 0.0).rgb,
                                   textureLod(tex1, cuv, 0.0).rgb, d));
        // A flock is always THERE; the picture decides how DENSE it is, not
        // whether it exists.  Tying presence to the picture alone emptied the
        // sky over anything bright.
        float there = step(hash21(id + 47.3), clamp(0.30 + 0.85 * want * coh, 0.0, 1.0));
        if (there < 0.5) continue;
        float r = cell * (0.26 + 0.16 * hash21(id + 19.7));
        float dist = length(p - c);
        // Round, soft-edged, jittered: a speck, never a lit grid cell.
        float b = smoothstep(r, r * 0.45, dist);
        mask = max(mask, b);
        // A bird turning shows the pale underside of its wings.
        float roll = 0.5 + 0.5 * sin(audioAdvance * 0.22 + hash21(id + 5.1) * 6.28);
        wing = max(wing, b * roll);
    }

    mask *= arc;
    vec3 bird = vec3(0.06, 0.06, 0.08);
    bird += vec3(0.85, 0.86, 0.90) * wing * arc
          * (0.10 + 0.40 * clamp(audioHigh * 2.0, 0.0, 1.0));

    vec3 col = mix(sky, bird, clamp(mask, 0.0, 1.0));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
