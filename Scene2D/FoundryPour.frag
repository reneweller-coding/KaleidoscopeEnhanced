#version 330 core
out vec4 fragColor;
/**
 * @file FoundryPour.frag
 * @brief FOUNDRY POUR: molten metal poured from a ladle into a sand
 * mould.  The ladle tips steadily on the scene clock and the stream falls
 * white-orange into the mould, where the melt spreads and cools from the
 * edges (colour by temperature); sparks (round) fly from the impact on
 * the clock and flare on the kick; the glow lights the whole shop -- the
 * photo is the foundry floor and the mould pattern.  The bass is the
 * furnace roar as light.  Camera fixed on the pour.
 *
 * Audio Reactivity:
 *   sceneAdvance -> the pour, sparks, cooling (continuous)
 *   audioKick    -> spark burst brightness (light)
 *   audioBass    -> furnace glow (light)
 *   audioSwell   -> pour rate (slow: the stream thickens)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: mouldP, sparkP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioBass;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float mouldP;
uniform float sparkP;
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

// Blackbody-ish colour by temperature 0 (dark) .. 1 (white-hot).
vec3 heatCol(float t)
{
    return vec3(smoothstep(0.0, 0.35, t), smoothstep(0.25, 0.75, t), smoothstep(0.6, 1.0, t)) * (0.2 + 1.8 * t);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float mouldW = 0.3 + 0.2 * clamp(mouldP, 0.0, 1.0);
    float sparks = 0.5 + 0.5 * clamp(sparkP, 0.0, 1.0);
    float rate = 0.5 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float clock = sceneAdvance * 0.6 + sceneTime * 0.12;
    float bass = clamp(audioBass, 0.0, 1.0);

    // The shop: the photo as the dark floor and walls, lit by the pour glow.
    vec2 spout = vec2(-0.1, 0.3);
    vec2 impact = vec2(-0.02, -0.18);
    vec3 col = img(gl_FragCoord.xy / resolution) * mix(vec3(0.5), imgPalette(hue * 0.159 + 0.55) * 0.8, 0.5) + 0.04;
    float glowD = length(p - impact);
    vec3 glow = heatCol(0.7);
    col *= 0.6 + 0.6 * exp(-glowD * 2.0);
    col += glow * exp(-glowD * 3.0) * 0.25 * (0.5 + 0.5 * bass);
    // Furnace glow at the left edge with the bass.
    col += heatCol(0.6) * exp(-(p.x + aspect * 0.5) * 4.0) * 0.3 * bass;
    // The ladle: a dark bucket tipped, its lip at the spout; the tip angle
    // breathes slowly on the clock so the pour never stops.
    float tip = 0.35 + 0.15 * sin(clock * 0.3);
    vec2 lq = p - spout - vec2(-0.12, 0.08);
    float ladle = smoothstep(0.16, 0.15, length(lq * vec2(1.0, 1.4))) * step(lq.y, 0.05 + lq.x * tip);
    col = mix(col, vec3(0.12, 0.1, 0.09) * (0.5 + 0.5 * exp(-glowD * 2.0)), ladle);
    col += heatCol(0.9) * smoothstep(0.02, 0.0, abs(length(lq * vec2(1.0, 1.4)) - 0.15)) * step(lq.y, 0.05 + lq.x * tip) * step(-0.02, lq.y) * 0.5;
    // The stream: a falling column that narrows and wobbles, white at the
    // spout, orange lower; thickness with the rate.
    float sy = clamp((spout.y - p.y) / (spout.y - impact.y), 0.0, 1.0);
    float wob = 0.01 * sin(sy * 30.0 - clock * 8.0) * sy;
    float sw = (0.02 + 0.015 * rate) * (1.0 - 0.4 * sy);
    float stream = smoothstep(sw, sw * 0.6, abs(p.x - spout.x - wob - sy * 0.08)) * step(impact.y - 0.01, p.y) * step(p.y, spout.y);
    col = mix(col, heatCol(1.0 - 0.25 * sy) * 1.3, stream);
    // The mould: a rectangular cavity; the melt spreads from the impact
    // outward with the pour and cools from the edges (temperature falls
    // with distance from the impact and rises with the rate).
    vec2 mq = p - impact;
    float inMould = step(abs(mq.x), mouldW) * step(-0.12, mq.y) * step(mq.y, 0.02);
    float fillR = mouldW * (0.4 + 0.6 * (0.5 + 0.5 * sin(clock * 0.2)));    // the fill front breathes
    float filled = smoothstep(fillR + 0.03, fillR - 0.03, abs(mq.x) + 0.3 * abs(mq.y));
    float temp = clamp(1.0 - (abs(mq.x) + 0.3 * abs(mq.y)) / max(fillR, 0.05) * 0.7, 0.0, 1.0) * (0.6 + 0.4 * rate);
    temp += 0.08 * fbm(mq * 30.0 + clock);
    vec3 sand = vec3(0.3, 0.22, 0.15) * (0.5 + 0.5 * hash21(floor(p * 200.0))) * (0.4 + 0.6 * exp(-glowD * 2.0));
    sand = mix(sand, img(fract(mq * 3.0 + 0.5)) * 0.5, 0.3);
    vec3 melt = heatCol(temp);
    // Cooled skin: a darker crust pattern where temperature is low.
    melt = mix(melt, heatCol(temp * 0.6), smoothstep(0.5, 0.2, temp) * 0.5);
    col = mix(col, mix(sand, melt, filled), inMould);
    col = mix(col, vec3(0.15, 0.12, 0.1), smoothstep(0.012, 0.0, abs(abs(mq.x) - mouldW)) * step(-0.14, mq.y) * step(mq.y, 0.04));
    // Sparks: round, flying from the impact on the clock, flaring on the kick.
    for (int k = 0; k < 24; ++k)
    {
        float fk = float(k);
        float ph = fract(clock * (0.8 + 0.6 * hash11(fk * 3.1)) + hash11(fk * 5.3));
        float ang = 1.2 + (hash11(fk * 7.7) - 0.5) * 2.0;
        float speed = 0.5 + 0.5 * hash11(fk * 9.1);
        vec2 sp = impact + vec2(cos(ang), sin(ang)) * ph * speed * 0.6 - vec2(0.0, 1.2 * ph * ph);
        float d = length(p - sp);
        float spark = smoothstep(0.008, 0.003, d) * (1.0 - ph) * sparks;
        col += heatCol(1.0 - ph * 0.5) * spark * (0.9 + 0.5 * audioKick) + heatCol(0.8) * exp(-d * 60.0) * (1.0 - ph) * 0.3 * sparks;
    }
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
