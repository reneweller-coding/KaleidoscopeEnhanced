#version 330 core
out vec4 fragColor;
/**
 * @file ScratchboardReveal.frag
 * @brief TRANSITION SCRATCHBOARD REVEAL: the outgoing scene goes to a black
 * ground, and the incoming one is scraped out of it in hatched strokes.
 *
 * Three hatch sets at fixed angles open one after another, and a stroke only
 * opens where the incoming picture is bright enough to deserve it -- so the
 * first set carves the highlights, the second the midtones, the third fills in.
 * That is how a scratchboard is actually worked, and it is why the picture
 * arrives as drawing rather than as a wipe.
 *
 * Each stroke's width is jittered along its own length, which is what keeps the
 * line chalky instead of mechanical.  Coverage is forced to one at the very end
 * so the ground is completely gone in the last frame.
 *
 * Audio Reactivity:
 *   audioAdvance -> a slow drift of the stroke phase (continuous)
 *   audioSwell   -> the stroke width (slow)
 *   audioHigh    -> the chalky glow along a fresh stroke (light)
 *   audioBass    -> the ground's depth (colour)
 *
 * Per-activation variety: hatchP, angleP, hueP.
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

uniform float hatchP;
uniform float angleP;
uniform float hueP;

const float PI = 3.14159265358979;

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
mat2 rot2D(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// One hatch set: parallel strokes at angle a, of spacing f, whose width follows
// the local tone.  Returns how far this pixel is INTO a stroke, 0..1.
float hatch(vec2 p, float a, float f, float tone, float width, float drift)
{
    vec2  q = rot2D(a) * p;
    float s = q.y * f + drift;
    float cell = floor(s);
    float u = fract(s) - 0.5;
    // Chalky: the stroke wanders and thins along its own length.
    float wob = (noise2(vec2(q.x * 3.2, cell * 1.7)) - 0.5) * 0.34;
    float thin = 0.55 + 0.75 * noise2(vec2(q.x * 1.4 + cell * 3.1, cell * 0.7));
    float half_w = clamp(width * tone * thin, 0.0, 0.48);
    return smoothstep(half_w, half_w * 0.45, abs(u - wob * half_w));
}

void main()
{
    float hatchDens = (hatchP > 0.0) ? hatchP : 1.0;
    float angBase   = clamp(angleP, 0.0, 1.0);
    float hue       = (hueP > 0.0) ? hueP : 0.0;

    float aspect = resolution.x / resolution.y;
    vec2  uv = gl_FragCoord.xy / resolution;
    vec2  p  = (uv - 0.5) * vec2(aspect, 1.0);

    float d = clamp(1.0 - interpolation, 0.0, 1.0);

    vec3  src0 = texture(tex0, uv).rgb;
    vec3  src1 = texture(tex1, uv).rgb;
    float tone = clamp(lum(src1) * 1.25, 0.0, 1.0);

    // The ground: the outgoing scene goes to black board.
    float ink = 0.88 * smoothstep(0.0, 0.14, d);
    // hueP runs the board from cold black to the warm brown boards.
    vec3  board = mix(vec3(0.020, 0.019, 0.028), vec3(0.036, 0.024, 0.016), fract(hue * 0.159));
    board *= 1.0 + 0.8 * clamp(audioBass, 0.0, 1.0);
    board *= 0.85 + 0.30 * noise2(p * 260.0);
    vec3  ground = mix(src0, board, ink);

    // Three sets, opened in turn.  The first works the highlights only.
    float a0 = mix(0.35, 0.95, angBase);
    float drift = audioAdvance * 0.012;
    float wid = (0.30 + 0.14 * clamp(audioSwell, 0.0, 1.0));

    float g1 = smoothstep(0.06, 0.34, d);
    float g2 = smoothstep(0.20, 0.56, d);
    float g3 = smoothstep(0.36, 0.78, d);

    float freq = 78.0 * hatchDens;
    float s1 = hatch(p, a0,        freq,        smoothstep(0.55, 1.0, tone) * g1, wid, drift) * g1;
    float s2 = hatch(p, a0 - 1.15, freq * 1.31, smoothstep(0.25, 0.85, tone) * g2, wid, -drift * 0.7) * g2;
    float s3 = hatch(p, a0 + 1.05, freq * 1.73, smoothstep(0.02, 0.60, tone) * g3, wid, drift * 0.4) * g3;

    float scraped = clamp(max(max(s1, s2), s3), 0.0, 1.0);
    // The last strokes join up and the ground is gone.
    scraped = mix(scraped, 1.0, smoothstep(0.74, 1.0, d));

    vec3 col = mix(ground, src1, scraped);

    // A fresh scrape throws up a chalky edge.
    float fresh = clamp(s1 * (1.0 - g2) + s2 * (1.0 - g3) + s3, 0.0, 1.0);
    float edge  = fresh * (1.0 - scraped * 0.55) * (1.0 - smoothstep(0.74, 1.0, d));
    col += vec3(0.92, 0.90, 0.84) * edge * (0.08 + 0.30 * clamp(audioHigh * 2.0, 0.0, 1.0));

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
