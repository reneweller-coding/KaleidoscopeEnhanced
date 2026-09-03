#version 330 core
out vec4 fragColor;
/**
 * @file PhraseTideBeach.frag
 * @brief PHRASE TIDE BEACH: a beach where the tide is the phrase clock --
 * the water line climbs the sand through each phrase and falls back as the
 * next begins (a sine of the phrase position, continuous through the wrap)
 * -- and the drop is the breaking wave: at the drop a wall of foam rolls
 * up the beach as round spray, then draws back.  The photo is the sand
 * and the sky; wet sand mirrors it.  Camera fixed on the shore.
 *
 * Audio Reactivity:
 *   audioPhrasePos -> tide level (continuous: sin of the position)
 *   audioDrop      -> the breaking wave (the drop; foam and spray, objects)
 *   sceneAdvance   -> wavelets and spray drift (continuous)
 *   audioSwell     -> sunlight on the water (slow)
 *   audioLevel     -> brightness
 *
 * Per-activation variety: slopeP, foamP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioPhrasePos;
uniform float audioDrop;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float slopeP;
uniform float foamP;
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
    float slope = 0.06 + 0.08 * clamp(slopeP, 0.0, 1.0);
    float foamAmt = 0.6 + 0.6 * clamp(foamP, 0.0, 1.0);
    float sunlight = 0.5 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    // The tide: a sine of the phrase position -- continuous at the wrap.
    float tide = 0.5 - 0.5 * cos(clamp(audioPhrasePos, 0.0, 1.0) * 6.2831853);
    float drop = clamp(audioDrop, 0.0, 1.0);

    // Beach seen from the dune: sky at the top, sea in the middle, sand
    // below; the water line runs across at y = waterY (tide) with wavelets.
    float horizon = 0.22;
    float waterY = -0.35 + 0.35 * tide;
    // The breaking wave: at the drop the foam wall runs up the beach and
    // draws back -- its reach is a smooth pulse of the drop envelope.
    float breakReach = smoothstep(0.0, 0.35, drop) * (1.0 - smoothstep(0.35, 1.0, drop)) * 0.35;
    float breakReach2 = sin(clamp(drop, 0.0, 1.0) * 3.14159) * 0.3;
    float reach = max(breakReach, breakReach2);
    float wavelet = 0.02 * sin(p.x * 12.0 + sceneAdvance * 2.0) + 0.01 * sin(p.x * 31.0 - sceneAdvance * 3.1);
    float lineY = waterY + reach + wavelet + 0.01 * fbm(vec2(p.x * 6.0, sceneAdvance * 0.3));

    vec3 col;
    if (p.y > horizon)
    {
        // Sky: the photo top, warm with the sun.
        col = img(vec2(p.x / aspect + 0.5, (p.y - horizon) / (0.5 - horizon) * 0.5 + 0.5)) * mix(vec3(0.6, 0.75, 1.0), imgPalette(hue * 0.159 + 0.6), 0.4);
        col += vec3(1.0, 0.85, 0.6) * exp(-length(p - vec2(-0.3, 0.42)) * 5.0) * sunlight * 0.5;
    }
    else if (p.y > lineY)
    {
        // Sea: the palette in blue-green, sparkle from the sun, darker far.
        float depthT = (p.y - lineY) / max(horizon - lineY, 1e-3);
        vec3 sea = mix(imgPalette(hue * 0.159 + 0.55) * vec3(0.4, 0.8, 1.0), vec3(0.1, 0.35, 0.5), depthT * 0.7);
        float sparkle = pow(fbm(vec2(p.x * 20.0 + sceneAdvance, p.y * 60.0 - sceneAdvance * 0.5)), 6.0) * 6.0;
        sea += vec3(1.0, 0.95, 0.85) * sparkle * sunlight * 0.5;
        // Foam at the water line, more in the break.
        float foam = smoothstep(0.06 + reach * 0.3, 0.0, p.y - lineY) * foamAmt * (0.4 + 2.0 * drop);
        foam *= 0.6 + 0.4 * fbm(vec2(p.x * 25.0, p.y * 40.0 + sceneAdvance * 3.0));
        col = mix(sea, vec3(0.95, 0.97, 1.0), clamp(foam, 0.0, 1.0));
    }
    else
    {
        // Sand: the photo, warm; wet below the highest recent water.
        vec3 sand = img(vec2(p.x / aspect + 0.5, (p.y + 0.5) * 0.5)) * mix(vec3(0.9, 0.8, 0.6), imgPalette(hue * 0.159 + 0.1), 0.35);
        float wet = smoothstep(0.0, 0.12, lineY - p.y);
        float wetLine = smoothstep(0.03, 0.0, lineY - p.y);
        // Wet sand mirrors the sky.
        vec3 mirror = img(vec2(p.x / aspect + 0.5, 0.75)) * mix(vec3(0.6, 0.75, 1.0), imgPalette(hue * 0.159 + 0.6), 0.4);
        sand = mix(sand, mix(sand * 0.7, mirror, 0.5), (1.0 - wet) * 0.6 * (1.0 - smoothstep(0.0, 0.25, lineY - p.y)));
        col = sand;
        col += vec3(0.95, 0.97, 1.0) * wetLine * foamAmt * 0.5 * (0.3 + drop);
        // Spray at the break: round droplets flung up the beach, on the
        // scene clock, only while the wave runs.
        vec2 su = (p + vec2(sceneAdvance * 0.2, -sceneAdvance * 0.8)) * 45.0; vec2 sc = floor(su); vec2 sf = fract(su) - 0.5;
        vec2 so = vec2(hash21(sc + 1.3), hash21(sc + 5.9)) - 0.5;
        float spray = smoothstep(0.22, 0.06, length(sf - so * 0.6)) * step(0.92, hash21(sc)) * smoothstep(0.3, 0.0, p.y - lineY + 0.1) * drop;
        col += vec3(0.95, 0.97, 1.0) * spray;
    }
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
