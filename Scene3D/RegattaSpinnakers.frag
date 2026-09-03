#version 330 core
out vec4 fragColor;
/**
 * @file RegattaSpinnakers.frag
 * @brief Fragment stage for RegattaSpinnakers: a bright sea sky, the sea
 * as the photo in blue-green with whitecaps on the bass, the spinnakers as
 * photo panels tinted per boat and lit by the sun (brighter on the belly),
 * dark hulls, masts, white wakes; the kick a gust flash on the sails,
 * the treble the spray sparkle.
 *
 * Audio Reactivity: audioBass -> whitecaps; audioKick -> gust flash;
 *                   audioHigh -> spray sparkle; audioSwell -> wind (generator) and sun; audioLevel.
 */
in vec2  vTexCoord;
in vec3  vWorld;
in float vKind;
in float vWind;
in float vId;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float sceneAdvance;
uniform float audioBass;
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
    vec3 col;
    if (vKind < -1.5)
    {
        // The sea: the photo as water colour, whitecaps (round flecks) on the bass.
        vec2 uv = vTexCoord;
        vec3 sea = img(fract(uv * vec2(6.0, 3.0) + vec2(sceneAdvance * 0.02, 0.0))) * mix(vec3(0.2, 0.5, 0.7), imgPalette(hue * 0.159 + 0.55), 0.3) * 1.3 * sun;
        sea = mix(sea, vec3(0.15, 0.4, 0.6) * sun, 0.4);
        vec2 cu = uv * vec2(80.0, 40.0) + vec2(sceneAdvance * 0.5, 0.0); vec2 cc = floor(cu); vec2 cf = fract(cu) - 0.5;
        vec2 co = vec2(hash21(cc + 1.3), hash21(cc + 5.9)) - 0.5;
        float cap = smoothstep(0.3, 0.1, length((cf - co * 0.5) * vec2(0.6, 1.0))) * step(1.0 - 0.15 * clamp(audioBass, 0.0, 1.0) - 0.03, hash21(cc));
        col = mix(sea, vec3(0.95, 0.98, 1.0) * sun, cap);
        col += vec3(1.0) * pow(hash21(cc + 9.9), 20.0) * clamp(audioHigh * 2.0, 0.0, 1.0) * 0.3 * cap;
        // Haze toward the horizon.
        col = mix(col, vec3(0.75, 0.85, 0.95) * sun, smoothstep(0.5, 1.0, uv.y) * 0.6);
        fragColor = vec4(col, 1.0);
        return;
    }
    if (vKind < -0.5)
    {
        vec2 uv = vTexCoord;
        col = mix(vec3(0.75, 0.85, 0.95), vec3(0.3, 0.5, 0.9), smoothstep(0.1, 0.7, uv.y)) * sun;
        col = mix(col, col * imgPalette(hue * 0.159 + 0.6) * 1.4, 0.1);
        fragColor = vec4(col, 1.0);
        return;
    }
    if (vKind > 2.5)
    {
        col = vec3(0.95, 0.98, 1.0) * (0.5 + 0.5 * vTexCoord.x) * sun * 0.7;     // wake, fading aft
        fragColor = vec4(col, 1.0);
        return;
    }
    if (vKind > 1.5)
    {
        col = vec3(0.85, 0.85, 0.88) * sun;                                       // mast
        fragColor = vec4(col, 1.0);
        return;
    }
    if (vKind > 0.5)
    {
        // The hull: dark, a white boot-top stripe, the photo as the topsides.
        col = mix(vec3(0.08, 0.1, 0.15), img(fract(vTexCoord * vec2(2.0, 1.0) + vId * 0.1)) * 0.6, 0.35) * (0.5 + 0.6 * vTexCoord.y) * sun;
        col = mix(col, vec3(0.9), smoothstep(0.03, 0.0, abs(vTexCoord.y - 0.2)) * 0.7);
        fragColor = vec4(col, 1.0);
        return;
    }
    // The spinnaker: photo panels tinted per boat, lit by the sun on the belly.
    vec3 photo = img(fract(vec2(vTexCoord.x * 2.0 + vId * 0.15, vTexCoord.y * 2.0)));
    vec3 tint = imgPalette(hue * 0.159 + fract(vId * 0.21)) * 1.5 + 0.15;
    float panel = step(0.5, fract(vTexCoord.y * 4.0 + vTexCoord.x * 2.0));
    col = mix(photo * 1.3, tint, 0.4 + 0.25 * panel) * sun;
    float belly = sin(vTexCoord.x * 3.14159) * sin(vTexCoord.y * 3.14159);
    col *= 0.55 + 0.6 * belly;
    col += vec3(1.0, 0.98, 0.9) * belly * audioKick * 0.5;
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
