#version 330 core
out vec4 fragColor;
/**
 * @file HourglassSandFall.frag
 * @brief HOURGLASS SAND FALL: a glass running through over the scene arc.
 * The upper bulb empties as a cone whose surface sinks, the stream falls
 * through the waist as a thin column of round grains, and the lower heap
 * grows into a mound with a crater where the stream lands.  All three are
 * one function of the arc, so the glass fills and empties without a cut.
 * The lamp behind it rides the swell, the treble is the grains catching
 * the light, and the kick is a knock that jolts a few grains loose (light).
 * Camera fixed on the glass.
 *
 * Audio Reactivity:
 *   sceneProgress -> the glass runs through (the arc)
 *   sceneAdvance  -> the grains fall (continuous)
 *   audioSwell    -> the lamp behind (slow)
 *   audioHigh     -> grain sparkle (light)
 *   audioKick     -> a knock lights the falling column (light)
 *
 * Per-activation variety: waistP, grainP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float sceneProgress;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioHigh;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float waistP;
uniform float grainP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

// The glass profile: the half-width of the bulb at height y.
float bulbHalf(float y, float waist)
{
    // Two cones meeting at the waist, with rounded shoulders.
    float t = abs(y) / 0.42;
    float w = mix(waist, 0.26, smoothstep(0.0, 1.0, t));
    // Round the shoulder off near the top and bottom plates.
    w *= smoothstep(1.02, 0.86, t);
    return w;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float waist = 0.012 + 0.014 * clamp(waistP, 0.0, 1.0);
    float grains = 0.5 + 0.9 * clamp(grainP, 0.0, 1.0);
    float lamp = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float prog = clamp(sceneProgress, 0.0, 1.0);
    float clock = sceneAdvance * 1.2 + sceneTime * 0.24;

    // The room behind: the photo, dim, with a lamp glow behind the glass.
    vec3 col = img(uv) * mix(vec3(0.18, 0.17, 0.16), imgPalette(hue * 0.159 + 0.6) * 0.3, 0.5) * lamp * 0.7;
    col += mix(vec3(1.0, 0.9, 0.7), imgPalette(hue * 0.159 + 0.1), 0.3) * exp(-length(p * vec2(0.8, 1.0)) * 2.2) * 0.25 * lamp;

    float half_ = bulbHalf(p.y, waist);
    float inGlass = step(abs(p.x), half_) * step(abs(p.y), 0.44);
    // The sand: the upper level falls, the lower heap rises, both smooth.
    float upperLevel = mix(0.42, 0.02, smoothstep(0.0, 1.0, prog));
    float heapH = mix(0.0, 0.34, smoothstep(0.0, 1.0, prog));
    vec3 sandCol = mix(vec3(0.88, 0.72, 0.42), imgPalette(hue * 0.159 + 0.12), 0.3);
    // Grain texture: round, jittered cells, so the sand never reads as a
    // flat fill.
    vec2 gg = p * 190.0;
    vec2 gc = floor(gg), gf = fract(gg) - 0.5;
    vec2 gj = vec2(hash21(gc + 1.3), hash21(gc + 5.9)) - 0.5;
    float grain = smoothstep(0.34, 0.1, length(gf - gj * 0.7));
    if (inGlass > 0.5)
    {
        // The upper body: sand below the level, with a funnel dipping to
        // the waist as it empties.
        float funnel = 0.05 + 0.28 * (1.0 - smoothstep(0.0, 0.55, prog));
        float surface = upperLevel - funnel * exp(-pow(p.x / max(half_, 1e-3) * 1.6, 2.0)) * smoothstep(0.05, 0.5, prog);
        float upper = step(0.02, p.y) * step(p.y, surface);
        // The lower heap: a mound with a crater under the stream.
        float mound = heapH * (1.0 - 0.55 * pow(abs(p.x) / max(half_, 1e-3), 1.6));
        mound -= 0.05 * heapH * exp(-pow(p.x * 22.0, 2.0));               // the crater
        float lower = step(-0.42, p.y) * step(p.y, -0.42 + mound);
        float sand = max(upper, lower);
        vec3 body = sandCol * (0.55 + 0.5 * grain);
        // Layering in the heap, and a darker packed base.
        body *= 0.8 + 0.3 * sin((p.y + 0.42) * 90.0 + p.x * 20.0);
        body *= 0.75 + 0.35 * smoothstep(-0.42, 0.0, p.y);
        // The lit rim of each surface.
        body += vec3(1.0, 0.95, 0.8) * smoothstep(0.01, 0.0, abs(p.y - surface)) * upper * 0.7 * lamp;
        body += vec3(1.0, 0.95, 0.8) * smoothstep(0.008, 0.0, abs(p.y + 0.42 - mound)) * lower * 0.7 * lamp;
        col = mix(col, body * lamp, sand);
        // The falling stream: a thin column of round grains between the
        // waist and the heap, only while there is sand above.
        float running = smoothstep(0.0, 0.04, prog) * smoothstep(1.0, 0.96, prog);
        float inStream = step(abs(p.x), 0.012) * step(p.y, 0.02) * step(-0.42 + mound, p.y);
        vec2 sg = vec2(p.x * 380.0, (p.y + clock * 0.9) * 190.0);
        vec2 sc = floor(sg), sf = fract(sg) - 0.5;
        vec2 sj = vec2(hash21(sc + 2.7), hash21(sc + 8.1)) - 0.5;
        float fall = smoothstep(0.3, 0.08, length(sf - sj * 0.7)) * step(1.0 - 0.55 * grains, hash21(sc));
        col += sandCol * inStream * fall * running * (1.2 + 0.9 * hi + 0.8 * audioKick);
        // The dust the stream throws up where it lands.
        vec2 land = vec2(0.0, -0.42 + mound);
        col += sandCol * exp(-length((p - land) * vec2(0.6, 2.2)) * 26.0) * running * (0.25 + 0.5 * hi) * 0.7;
        // The glass itself: a bright inner edge and a soft body tint.
        float edge = smoothstep(0.006, 0.0, half_ - abs(p.x));
        col += vec3(0.85, 0.92, 1.0) * edge * (0.35 + 0.4 * lamp);
        col = mix(col, col * vec3(0.94, 0.98, 1.0), 0.25);
        // A specular streak down the left of the glass.
        col += vec3(1.0) * exp(-pow((p.x + half_ * 0.55) * 40.0, 2.0)) * 0.12 * lamp;
    }
    // The frame: two plates and three posts.
    float plate = step(abs(abs(p.y) - 0.455), 0.022) * step(abs(p.x), 0.3);
    vec3 frameCol = mix(vec3(0.45, 0.3, 0.16), imgPalette(hue * 0.159 + 0.08), 0.25);
    frameCol *= 0.7 + 0.4 * noise2(p * 50.0);
    col = mix(col, frameCol * lamp, plate);
    for (int k = -1; k <= 1; k += 2)
    {
        float px = float(k) * 0.27;
        float post = step(abs(p.x - px), 0.014) * step(abs(p.y), 0.46);
        col = mix(col, frameCol * lamp * (0.8 + 0.3 * float(k)), post);
    }
    col *= 0.9 + 0.2 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
