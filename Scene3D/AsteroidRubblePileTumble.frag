#version 330 core
out vec4 fragColor;
/**
 * @file AsteroidRubblePileTumble.frag
 * @brief Fragment stage for AsteroidRubblePileTumble: boulders of the
 * photo, grey-brown regolith with the sunward term from the generator
 * (hard shadow on the night side, a little earthshine from the palette),
 * the probe as a bright box, the touchdown dust as soft round puffs that
 * the kick lights, the Sun and round stars behind.
 *
 * Audio Reactivity: audioKick -> dust puff light; audioSwell -> sunlight;
 *                   audioHigh -> regolith glints; audioLevel -> brightness.
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
    float sun = 0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col;
    if (vKind < -0.5)
    {
        // Space: round stars, the Sun as a bright disc off to the upper left.
        vec2 uv = vTexCoord;
        col = vec3(0.004, 0.005, 0.01);
        vec2 su = uv * vec2(260.0, 150.0); vec2 sc = floor(su); vec2 sf = fract(su) - 0.5;
        vec2 so = vec2(hash21(sc + 1.3), hash21(sc + 5.9)) - 0.5;
        col += vec3(0.8) * smoothstep(0.14, 0.03, length(sf - so * 0.6)) * step(0.985, hash21(sc));
        float sd = length((uv - vec2(0.2, 0.8)) * vec2(1.7, 1.0));
        col += vec3(1.0, 0.95, 0.85) * (smoothstep(0.02, 0.015, sd) * 2.0 + exp(-sd * 12.0) * 0.6) * sun;
        fragColor = vec4(col, 1.0);
        return;
    }
    if (vKind > 2.5)
    {
        col = vec3(0.85, 0.85, 0.9) * (0.6 + 0.4 * vTexCoord.y) * sun + vec3(1.0, 0.6, 0.2) * step(0.9, vTexCoord.x) * step(vTexCoord.y, 0.2);
        fragColor = vec4(col, 1.0);
        return;
    }
    if (vKind > 1.5)
    {
        // Dust puff: round, soft, lit by the kick, fading with life.
        vec2 d = (vTexCoord - 0.5) * 2.0;
        float r = length(d);
        if (r > 1.0) discard;
        float a = (1.0 - r * r) * vLit;
        col = vec3(0.75, 0.7, 0.62) * a * (0.3 + 1.5 * audioKick) * sun;
        fragColor = vec4(col, 1.0);
        return;
    }
    // A boulder: the photo tile as regolith, shaded by the sunward term with
    // a hard terminator and faint earthshine on the night side.
    vec3 photo = img(vTexCoord);
    vec3 rego = mix(vec3(0.42, 0.38, 0.34), photo * 1.2, 0.4);
    rego = mix(rego, rego * imgPalette(hue * 0.159 + 0.5) * 1.6, 0.15);
    float lit = clamp(vLit, 0.0, 1.0);
    float night = 1.0 - smoothstep(-0.05, 0.1, vLit);
    col = rego * (0.08 + 0.95 * lit) * sun;
    col += imgPalette(hue * 0.159 + 0.6) * 0.06 * night;
    // Rounded boulder edge: darken toward the tile edge so it reads as a rock.
    vec2 e = abs(vTexCoord - (floor(vTexCoord / 0.15) * 0.15 + 0.075)) / 0.075;
    float edge = smoothstep(1.0, 0.6, max(e.x, e.y));
    col *= 0.55 + 0.45 * edge;
    // Regolith glints on the treble.
    vec2 gu = vTexCoord * 300.0; vec2 gc = floor(gu); vec2 gf = fract(gu) - 0.5;
    vec2 go = vec2(hash21(gc + 1.3), hash21(gc + 5.9)) - 0.5;
    float glint = smoothstep(0.35, 0.1, length(gf - go * 0.5)) * step(0.985, hash21(gc)) * lit;   // round glints (V8e)
    col += vec3(1.0) * glint * clamp(audioHigh * 2.0, 0.0, 1.0) * 0.8;
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
