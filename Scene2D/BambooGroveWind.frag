#version 330 core
out vec4 fragColor;
/**
 * @file BambooGroveWind.frag
 * @brief BAMBOO GROVE WIND: inside a grove of tall culms, looking up the
 * green columns into the light.  A slow wave of wind on the scene clock
 * runs through the grove and every culm sways with it (bending more
 * toward the top), the leaves at the top hiss with the treble as glints,
 * the light beyond the culms (the photo) is the swell, the bass is the
 * creak as a low warm glow at the base.  Camera fixed on the path.
 *
 * Audio Reactivity:
 *   sceneAdvance -> the wind wave (continuous, slow)
 *   audioSwell   -> light through the leaves (slow)
 *   audioHigh    -> leaf glints (light)
 *   audioBass    -> base glow (light)
 *   audioKick    -> a gust brightens the leaves (light)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: densP, windP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioHigh;
uniform float audioBass;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float densP;
uniform float windP;
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

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = p * 2.03 + 5.0; a *= 0.5; }
    return v;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    int nCulms = 14 + int(clamp(densP, 0.0, 1.0) * 12.0);
    float wind = 0.3 + 0.7 * clamp(windP, 0.0, 1.0);
    float light = 0.6 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float clock = sceneAdvance * 0.4 + sceneTime * 0.08;
    float wave = sin(clock * 0.9);

    // The light beyond: the photo as sky and leaves seen through the grove,
    // brightest at the top; leaf canopy as a noise mask with glints.
    vec3 beyond = img(gl_FragCoord.xy / resolution) * mix(vec3(0.7, 1.0, 0.6), imgPalette(hue * 0.159 + 0.3), 0.3) * light;
    beyond *= 0.4 + 0.8 * smoothstep(-0.5, 0.5, p.y);
    float canopy = fbm(vec2(p.x * 3.0 + 0.1 * wave, p.y * 3.0) + 2.0);
    float leafMask = smoothstep(0.4, 0.7, canopy) * smoothstep(0.0, 0.45, p.y);
    vec3 leaf = mix(vec3(0.3, 0.55, 0.2), imgPalette(hue * 0.159 + 0.35), 0.3) * light;
    vec3 col = mix(beyond, leaf * (0.6 + 0.6 * canopy), leafMask);
    // Leaf glints on the treble, brighter in a gust.
    vec2 gu = p * 40.0; vec2 gc = floor(gu); vec2 gf = fract(gu) - 0.5;
    vec2 go = vec2(hash21(gc + 1.3), hash21(gc + 5.9)) - 0.5;
    float glint = smoothstep(0.2, 0.06, length(gf - go * 0.6)) * step(0.93, hash21(gc)) * leafMask;
    col += vec3(1.0, 1.0, 0.85) * glint * (0.2 + 0.9 * hi + 0.8 * audioKick) * light;
    // Culms: vertical columns from far (thin, pale) to near (thick, dark
    // green), each bending with the wind wave, more toward the top; nodes
    // as rings; the photo as their sheen.
    for (int i = 0; i < 26; ++i)
    {
        if (i >= nCulms) break;
        float fi = float(i);
        float depth = hash11(fi * 3.7);                                  // 0 near .. 1 far
        float x0 = (hash11(fi * 5.3) - 0.5) * aspect * 1.2;
        float w = (0.05 - 0.04 * depth);
        float bendAmp = wind * 0.12 * (1.0 - depth * 0.5);
        float phase = clock * 0.9 - x0 * 1.5;                             // the wave runs across the grove
        float bend = bendAmp * sin(phase) * pow(clamp(p.y + 0.5, 0.0, 1.0), 2.0);
        float dx = p.x - x0 - bend;
        float culm = smoothstep(w, w * 0.85, abs(dx));
        float nx = dx / w;
        float shade = 0.5 + 0.5 * sqrt(max(1.0 - nx * nx, 0.0));
        vec3 green = mix(vec3(0.35, 0.55, 0.25), img(vec2(fract(fi * 0.13), (p.y + 0.5) * 0.5)) * 0.8, 0.3) * light;
        green = mix(green, vec3(0.6, 0.65, 0.5) * light, depth * 0.6);
        green *= shade * (0.4 + 0.6 * smoothstep(-0.5, 0.5, p.y));
        // Nodes: dark rings every so often.
        float node = smoothstep(0.02, 0.0, abs(fract((p.y + 0.5) * (4.0 + 2.0 * hash11(fi * 7.7))) - 0.5) - 0.47);
        green *= 1.0 - 0.4 * node;
        green += vec3(1.0, 0.95, 0.8) * pow(max(1.0 - abs(nx + 0.4) * 2.0, 0.0), 4.0) * 0.3 * light;
        // The base glow with the bass.
        green += vec3(0.5, 0.4, 0.15) * exp(-(p.y + 0.5) * 3.0) * clamp(audioBass, 0.0, 1.0) * 0.5;
        col = mix(col, green, culm * (1.0 - depth * 0.3));
    }
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
