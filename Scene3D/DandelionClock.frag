#version 330 core
out vec4 fragColor;
/**
 * @file DandelionClock.frag
 * @brief Fragment stage for DandelionClock: a summer meadow behind (the
 * photo as soft bokeh with round highlights), the seed head backlit by a
 * low sun -- the pappus bristles as fine radial lines in a soft white
 * disc, the seeds as tiny brown grains, the stalks as hairlines; the
 * treble sparkles the bristles, the kick warms the backlight.
 *
 * Audio Reactivity: audioHigh -> bristle sparkle; audioKick -> backlight;
 *                   audioSwell -> release (generator); audioLevel -> brightness.
 */
in vec2  vTexCoord;
in vec3  vWorld;
in float vKind;
in float vLit;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float sceneAdvance;
uniform float audioKick;
uniform float audioHigh;
uniform float audioSwell;
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
    float sun = 0.7 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    vec3 warm = vec3(1.0, 0.92, 0.75) * (1.0 + 0.5 * audioKick);
    vec3 col;
    if (vKind < -0.5)
    {
        // Meadow bokeh: the photo blurred (coarse mip) with round highlights.
        vec2 uv = vTexCoord;
        vec3 soft = (interpolation * textureLod(tex0, uv, 4.0) + (1.0 - interpolation) * textureLod(tex1, uv, 4.0)).rgb;
        col = mix(soft, soft * vec3(0.9, 1.05, 0.7), 0.4) * sun;
        vec2 bu = uv * vec2(18.0, 10.0); vec2 bc = floor(bu); vec2 bf = fract(bu) - 0.5;
        vec2 bo = vec2(hash21(bc + 1.3), hash21(bc + 5.9)) - 0.5;
        float bokeh = smoothstep(0.3, 0.22, length(bf - bo * 0.5)) * step(0.9, hash21(bc));
        col += warm * bokeh * 0.35 * sun;
        col = mix(col, vec3(1.0, 0.95, 0.8), exp(-length(uv - vec2(0.75, 0.7)) * 3.0) * 0.5 * sun);
        fragColor = vec4(col, 1.0);
        return;
    }
    if (vKind > 3.5)
    {
        // Stalk on the head: hairline, fading as the seed leaves.
        if (vLit < 0.05) discard;
        col = vec3(0.85, 0.8, 0.65) * sun * vLit;
    }
    else if (vKind > 2.5)
    {
        col = vec3(0.35, 0.5, 0.15) * (0.6 + 0.4 * vTexCoord.x) * sun;     // the stem
    }
    else if (vKind > 1.5)
    {
        // The receptacle: a round pale-green knob.
        vec2 d = vTexCoord - 0.5;
        float r = length(d) * 2.0;
        if (r > 1.0) discard;
        float sh = sqrt(1.0 - r * r);
        col = vec3(0.75, 0.8, 0.55) * (0.4 + 0.6 * sh) * sun;
    }
    else if (vKind > 0.5)
    {
        if (vLit < 0.02 && vTexCoord.y < 0.0) discard;
        col = vec3(0.45, 0.32, 0.18) * sun;                              // the seed grain
    }
    else
    {
        // Pappus: radial bristles from the bottom centre of the quad, in a
        // soft translucent disc; sparkle with the treble.
        vec2 d = vec2(vTexCoord.x - 0.5, vTexCoord.y);
        float r = length(d * vec2(1.0, 1.0));
        float ang = atan(d.y, d.x);
        float bristle = pow(0.5 + 0.5 * sin(ang * 28.0), 6.0);
        float disc = smoothstep(1.0, 0.7, r) * step(0.02, d.y);
        float a = disc * (0.15 + 0.85 * bristle);
        if (a < 0.3) discard;
        vec3 white = mix(vec3(1.0), imgPalette(hue * 0.159 + 0.6), 0.15) * warm;
        col = white * (0.8 + 0.6 * a) * sun * (1.0 + 0.3 * clamp(audioHigh * 2.0, 0.0, 1.0) * bristle);
        col *= 0.6 + 0.4 * (vLit > 0.01 ? vLit : 1.0);
    }
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
