#version 330 core
out vec4 fragColor;
/**
 * @file HotAirBalloonDawn.frag
 * @brief Fragment stage for HotAirBalloonDawn: a dawn sky (orange to blue)
 * with the sun on the horizon and the swell as its strength, the misty
 * field below as the photo, the envelopes in gores of the photo tinted per
 * balloon and lit from the east, the baskets in wicker, the burners
 * flaring on the kick and glowing into the envelope from below.
 *
 * Audio Reactivity: audioKick -> burner flare; audioSwell -> sunrise;
 *                   audioBass -> burner roar glow; audioLevel -> brightness.
 */
in vec2  vTexCoord;
in vec3  vWorld;
in float vKind;
in float vLit;
in float vId;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float sceneAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioBass;
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

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

void main()
{
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float dawn = 0.5 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    vec3 col;
    if (vKind < -1.5)
    {
        // The field: the photo as misty meadow, brighter toward the horizon.
        vec2 uv = vTexCoord;
        col = img(fract(uv * vec2(3.0, 1.0))) * mix(vec3(0.5, 0.6, 0.4), imgPalette(hue * 0.159 + 0.3), 0.3) * dawn;
        col = mix(col, vec3(0.9, 0.8, 0.7) * dawn, smoothstep(0.3, 1.0, uv.y) * 0.6);    // ground mist
        fragColor = vec4(col, 1.0);
        return;
    }
    if (vKind < -0.5)
    {
        vec2 uv = vTexCoord;
        vec3 sky = mix(vec3(1.0, 0.6, 0.3), vec3(0.4, 0.55, 0.85), smoothstep(0.1, 0.6, uv.y));
        sky = mix(sky, sky * imgPalette(hue * 0.159 + 0.6) * 1.4, 0.15) * dawn;
        sky += vec3(1.0, 0.9, 0.7) * exp(-length((uv - vec2(0.62, 0.14)) * vec2(1.8, 1.0)) * 5.0) * dawn;
        col = sky;
        fragColor = vec4(col, 1.0);
        return;
    }
    if (vKind > 1.5)
    {
        // The burner flame: a bright teardrop, flaring on the kick.
        vec2 d = (vTexCoord - 0.5) * 2.0;
        float flame = smoothstep(1.0, 0.4, length(d * vec2(1.4, 0.9) - vec2(0.0, -0.2)));
        if (flame < 0.05) discard;
        col = mix(vec3(1.0, 0.5, 0.1), vec3(1.0, 0.95, 0.8), flame) * flame * (0.8 + 2.5 * audioKick + 0.6 * clamp(audioBass, 0.0, 1.0));
        fragColor = vec4(col, 1.0);
        return;
    }
    if (vKind > 0.5)
    {
        // The basket: wicker weave.
        float weave = 0.7 + 0.3 * step(0.5, fract(vTexCoord.x * 12.0 + step(0.5, fract(vTexCoord.y * 6.0)) * 0.5));
        col = vec3(0.45, 0.32, 0.18) * weave * dawn;
        fragColor = vec4(col, 1.0);
        return;
    }
    // The envelope: gores of the photo, each balloon its own tint, lit from
    // the east (vLit), the burner glow warming the lower rows.
    float gore = step(0.5, fract(vTexCoord.x * 8.0 * 2.0));
    vec3 photo = img(fract(vec2(vTexCoord.x * 3.0 + vId * 0.17, vTexCoord.y)));
    vec3 tint = imgPalette(hue * 0.159 + fract(vId * 0.23));
    col = mix(photo * 1.3, tint * 1.5, 0.4 + 0.3 * gore) * dawn;
    col *= 0.35 + 0.8 * vLit;
    float lower = 1.0 - smoothstep(0.0, 0.45, vTexCoord.y);
    col += vec3(1.0, 0.6, 0.25) * lower * (0.25 + 1.2 * audioKick + 0.3 * clamp(audioBass, 0.0, 1.0));
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
