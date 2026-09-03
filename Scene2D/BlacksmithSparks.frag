#version 330 core
out vec4 fragColor;
/**
 * @file BlacksmithSparks.frag
 * @brief BLACKSMITH SPARKS: a glowing bar on the anvil under the hammer.
 * The bar's heat is the swell (it is drawn from the fire and cools), the
 * kick is the hammer blow -- a flash on the bar and a burst of round
 * sparks (light only: the sparks fly on the scene clock, the blow
 * brightens them), the bass is the forge fire behind, the treble the
 * scale flaking off as glints; the photo is the smithy wall and the
 * bar's surface.  Camera fixed at the anvil.
 *
 * Audio Reactivity:
 *   audioSwell   -> bar heat (slow)
 *   audioKick    -> hammer flash and spark brightness (light)
 *   audioBass    -> forge glow (light)
 *   audioHigh    -> scale glints (light)
 *   sceneAdvance -> spark flight (continuous)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: barP, sparkP, hueP.
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
uniform float audioKick;
uniform float audioBass;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float barP;
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

vec3 heatCol(float t)
{
    return vec3(smoothstep(0.0, 0.35, t), smoothstep(0.25, 0.75, t), smoothstep(0.6, 1.0, t)) * (0.2 + 1.8 * t);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float barLen = 0.35 + 0.2 * clamp(barP, 0.0, 1.0);
    float sparks = 0.5 + 0.5 * clamp(sparkP, 0.0, 1.0);
    float heat = 0.35 + 0.55 * clamp(audioSwell, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float clock = sceneAdvance * 0.8 + sceneTime * 0.15;
    vec2 anvilTop = vec2(0.0, -0.12);

    // The smithy: the photo dark, the forge fire glowing at the right with the bass.
    vec3 col = img(gl_FragCoord.xy / resolution) * mix(vec3(0.4), imgPalette(hue * 0.159 + 0.55) * 0.7, 0.5) + 0.04;
    vec2 forge = vec2(0.6, 0.15);
    float fd = length((p - forge) * vec2(1.0, 1.3));
    col += heatCol(0.8) * (smoothstep(0.2, 0.17, fd) * 0.6 + exp(-fd * 3.0) * 0.5) * (0.4 + 0.7 * bass);
    col *= 0.5 + 0.5 * exp(-length(p - anvilTop) * 1.8) * (0.5 + heat) + 0.2 * bass * exp(-fd * 2.0);
    // The anvil: a dark mass under the bar.
    float anvil = step(abs(p.x), 0.32) * step(p.y, anvilTop.y) * step(anvilTop.y - 0.14, p.y) * step(abs(p.x) - 0.32 + (anvilTop.y - p.y) * 0.5, 0.0);
    anvil = max(anvil, step(abs(p.x), 0.14) * step(anvilTop.y - 0.42, p.y) * step(p.y, anvilTop.y - 0.14));
    col = mix(col, vec3(0.12, 0.12, 0.13) * (0.6 + 0.4 * exp(-length(p - anvilTop) * 3.0)), anvil);
    col += heatCol(0.7) * smoothstep(0.01, 0.0, abs(p.y - anvilTop.y)) * step(abs(p.x), 0.32) * heat * 0.3;
    // The bar: glowing along its length, hottest at the working end (left),
    // its surface the photo as scale; the hammer flash on the kick.
    vec2 bq = p - anvilTop - vec2(0.0, 0.03);
    float bar = step(abs(bq.y), 0.028) * step(-barLen, bq.x) * step(bq.x, barLen * 0.6);
    float along = (bq.x + barLen) / (barLen * 1.6);                  // 0 at the hot end
    float temp = heat * (1.0 - 0.6 * along);
    temp = clamp(temp + 0.35 * audioKick * (1.0 - along), 0.0, 1.0);
    vec3 barCol = heatCol(temp);
    vec3 scale = img(fract(vec2(bq.x * 2.0 + 0.5, bq.y * 8.0 + 0.5))) * 0.3;
    barCol = mix(barCol, scale, smoothstep(0.5, 0.1, temp) * 0.6);
    barCol *= 0.7 + 0.3 * sqrt(max(1.0 - pow(bq.y / 0.028, 2.0), 0.0));
    // Scale glints on the treble.
    vec2 gu = bq * 60.0; vec2 gc = floor(gu); vec2 gf = fract(gu) - 0.5;
    vec2 go = vec2(hash21(gc + 1.3), hash21(gc + 5.9)) - 0.5;
    barCol += vec3(1.0) * smoothstep(0.2, 0.06, length(gf - go * 0.6)) * step(0.9, hash21(gc)) * clamp(audioHigh * 2.0, 0.0, 1.0) * 0.6;
    col = mix(col, barCol, bar);
    // The hammer: a head above the bar, dropping smoothly on the clock
    // (its strike is not synchronised to the kick: the kick is the light).
    float swing = 0.5 + 0.5 * cos(clock * 3.0);
    vec2 hq = p - anvilTop - vec2(-barLen * 0.7, 0.07 + 0.25 * swing);
    float head = step(abs(hq.x), 0.05) * step(abs(hq.y), 0.03);
    float handle = step(abs(hq.x - 0.03), 0.008) * step(0.0, hq.y) * step(hq.y, 0.35);
    col = mix(col, vec3(0.2, 0.18, 0.16), max(head, handle));
    col += heatCol(0.9) * head * (1.0 - swing) * audioKick * 0.8;
    // Sparks: round, flying from the hot end on the clock, brightest on the kick.
    vec2 origin = anvilTop + vec2(-barLen * 0.7, 0.03);
    for (int k = 0; k < 30; ++k)
    {
        float fk = float(k);
        float ph = fract(clock * (0.9 + 0.7 * hash11(fk * 3.1)) + hash11(fk * 5.3));
        float ang = 0.4 + (hash11(fk * 7.7) - 0.5) * 2.6;
        float speed = 0.6 + 0.6 * hash11(fk * 9.1);
        vec2 sp = origin + vec2(cos(ang), sin(ang)) * ph * speed * 0.7 - vec2(0.0, 1.0 * ph * ph);
        float d = length(p - sp);
        float spark = smoothstep(0.007, 0.0025, d) * (1.0 - ph) * sparks;
        col += heatCol(1.0 - ph * 0.6) * spark * (0.6 + 1.8 * audioKick) + heatCol(0.8) * exp(-d * 70.0) * (1.0 - ph) * 0.3 * sparks;
    }
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
