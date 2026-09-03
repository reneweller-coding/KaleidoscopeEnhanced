#version 330 core
out vec4 fragColor;
/**
 * @file TurtleHatchlingsMoon.frag
 * @brief Fragment stage for TurtleHatchlingsMoon: a night sky with a
 * moon (the swell) and round stars, the sea as the photo in silver-blue
 * with a moon path and waves sliding up on the clock (the bass), the
 * beach as pale sand (the photo), the hatchlings as dark round shells
 * with a moonlit sheen, their tracks; the kick a wave breaking brighter,
 * the treble the wet-sand sparkle.
 *
 * Audio Reactivity: audioSwell -> moon; audioBass -> waves; audioKick ->
 *                   breaking foam; audioHigh -> sparkle; audioLevel.
 */
in vec2  vTexCoord;
in vec3  vWorld;
in float vKind;
in float vPh;
in float vId;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float sceneAdvance;
uniform float audioSwell;
uniform float audioBass;
uniform float audioKick;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioAdvance;
uniform float audioValence;
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

void main()
{
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float moon = 0.5 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    vec3 moonCol = vec3(0.75, 0.82, 0.95);
    vec3 col;
    if (vKind < -2.5)
    {
        // The sea: the photo in silver-blue, a moon path, waves sliding up on the clock.
        vec2 uv = vTexCoord;
        vec3 sea = img(fract(uv * vec2(4.0, 2.0))) * mix(vec3(0.15, 0.25, 0.4), imgPalette(hue * 0.159 + 0.6), 0.3) * 1.2;
        float path = exp(-abs(uv.x - 0.55) * 8.0) * moon;
        sea += moonCol * path * 0.6 * pow(0.5 + 0.5 * sin(uv.y * 120.0 + sceneAdvance), 4.0);
        float wave = pow(0.5 + 0.5 * sin(uv.y * 30.0 - sceneAdvance * 1.5), 6.0) * (0.3 + 0.7 * clamp(audioBass, 0.0, 1.0));
        sea += vec3(0.9, 0.95, 1.0) * wave * (0.3 + 1.0 * audioKick) * (1.0 - uv.y);
        col = sea * moon;
        fragColor = vec4(col, 1.0);
        return;
    }
    if (vKind < -1.5)
    {
        // The beach: pale sand (the photo), wet near the sea, sparkling on the treble.
        vec2 uv = vTexCoord;
        vec3 sand = img(fract(uv * vec2(3.0, 1.0))) * mix(vec3(0.75, 0.7, 0.6), imgPalette(hue * 0.159 + 0.1), 0.2) * 0.8;
        sand = mix(sand, sand * 0.6, smoothstep(0.7, 1.0, uv.y));
        vec2 gu = uv * vec2(200.0, 60.0); vec2 gc = floor(gu); vec2 gf = fract(gu) - 0.5;
        vec2 go = vec2(hash21(gc + 1.3), hash21(gc + 5.9)) - 0.5;
        float glint = smoothstep(0.2, 0.05, length(gf - go * 0.6)) * step(0.96, hash21(gc)) * smoothstep(0.5, 0.95, uv.y);
        col = sand * moon + moonCol * glint * clamp(audioHigh * 2.0, 0.0, 1.0);
        fragColor = vec4(col, 1.0);
        return;
    }
    if (vKind < -0.5)
    {
        vec2 uv = vTexCoord;
        col = mix(vec3(0.02, 0.03, 0.08), vec3(0.05, 0.06, 0.12), 1.0 - uv.y);
        vec2 su = uv * vec2(260.0, 150.0); vec2 sc = floor(su); vec2 sf = fract(su) - 0.5;
        vec2 so = vec2(hash21(sc + 1.3), hash21(sc + 5.9)) - 0.5;
        col += vec3(0.7) * smoothstep(0.14, 0.03, length(sf - so * 0.6)) * step(0.985, hash21(sc));
        float md = length((uv - vec2(0.55, 0.45)) * vec2(1.8, 1.0));
        col += moonCol * (smoothstep(0.035, 0.03, md) * 1.5 + exp(-md * 8.0) * 0.5) * moon;
        fragColor = vec4(col, 1.0);
        return;
    }
    if (vKind > 2.5)
    {
        vec2 nd = (vTexCoord - vec2(0.5, 0.0)) * vec2(2.0, 1.0);
        if (length(nd) > 1.0) discard;                                          // a rounded mound, not a slab
        col = vec3(0.5, 0.45, 0.36) * (0.45 + 0.55 * sqrt(1.0 - dot(nd, nd))) * moon;   // the nest mound
        fragColor = vec4(col, 1.0);
        return;
    }
    if (vKind > 1.5)
    {
        col = vec3(0.45, 0.42, 0.36) * moon * 0.9;                              // the track: slightly darker sand
        fragColor = vec4(col, 1.0);
        return;
    }
    if (vKind > 0.5)
    {
        col = vec3(0.12, 0.12, 0.1) * moon;                                     // a flipper
        fragColor = vec4(col, 1.0);
        return;
    }
    // The shell: a round dark dome with a moonlit sheen and scute pattern.
    vec2 d = (vTexCoord - 0.5) * 2.0;
    float r = length(d);
    if (r > 1.0) discard;
    float sh = sqrt(1.0 - r * r);
    float scutes = smoothstep(0.08, 0.0, abs(sin(d.x * 6.0) * sin(d.y * 5.0)) - 0.02);
    col = mix(vec3(0.12, 0.13, 0.12), vec3(0.2, 0.2, 0.18), scutes) * (0.3 + 0.7 * sh) * moon;
    col += moonCol * pow(max(dot(normalize(vec3(d, sh)), normalize(vec3(0.3, 0.8, 0.6))), 0.0), 12.0) * 0.5 * moon;
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
