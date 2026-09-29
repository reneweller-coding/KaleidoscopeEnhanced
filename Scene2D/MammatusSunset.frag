#version 330 core
out vec4 fragColor;
/**
 * @file MammatusSunset.frag
 * @brief MAMMATUS SUNSET: after a thunderstorm, the underside of its anvil
 * hangs over the land in mammatus -- hundreds of round pouches bulging
 * down from the cloud base, filling the whole sky, receding in perspective
 * toward the horizon, and the setting sun shining in underneath them from
 * a clear strip on the horizon, so every pouch glows red and orange on
 * its lower side and falls into deep violet shadow above.  A dark land
 * lies under the burning strip.  The pouches swell and drift slowly.
 *
 * Audio Reactivity:
 *   audioSwell  -> the strength of the red light (slow)
 *   audioBass   -> the glow in the gap on the horizon (light)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> the pouches drifting and swelling
 *
 * Per-activation variety: pouchP (the size of the pouches), hueP.
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneTime;
uniform float sceneAdvance;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioBass;
uniform float audioLevel;
uniform float audioValence;
uniform float audioChromaHue;

uniform float pouchP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

float hash21(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;
    float cell = 1.0 + 0.6 * clamp(pouchP, 0.0, 1.0);

    float hz = -0.3;                                         // the horizon
    vec3 sunC = vec3(1.0, 0.38, 0.12);
    vec3 col;
    if (p.y > hz + 0.06) {
        // The cloud base above, in perspective: plane coordinates.
        float z = 1.0 / (p.y - hz);
        vec2 q = vec2(p.x * z, z) * 3.0 / cell + vec2(T * 0.01, T * 0.02);
        vec2 qi = floor(q), qf = fract(q);
        // The nearest pouches: round bulges hanging from the base.
        // A soft maximum over the neighbours, so pouches merge into each
        // other in smooth creases instead of hard cuts.
        float sw = 0.0;
        vec2 gw = vec2(0.0);
        for (int j = -1; j <= 1; ++j)
        for (int i = -1; i <= 1; ++i) {
            vec2 o = vec2(i, j);
            vec2 c = o + 0.25 + 0.5 * hash22(qi + o);
            float r = 0.55 + 0.2 * hash21(qi + o + 7.0) + 0.05 * sin(T * 0.1 + hash21(qi + o) * 20.0);
            vec2 d = (qf - c) / r;
            float h = 1.0 - dot(d, d);
            float w = exp(7.0 * h);
            sw += w;
            gw += w * d;
        }
        float bump = clamp(log(sw) / 7.0, 0.0, 1.0);
        vec2 grad = gw / sw;
        bump = sqrt(bump);
        // Pouch normal (pointing down toward the viewer), from its shape.
        vec3 n = normalize(vec3(grad.x, -max(bump, 0.05), grad.y));
        // The sun low on the horizon ahead: it lights the pouches' near,
        // lower sides.
        vec3 L = normalize(vec3(-0.25, -0.18, -1.0));
        float lit = max(dot(n, L), 0.0) * smoothstep(0.05, 0.35, bump);   // creases stay in shadow
        // Far away the pouches melt into an even glow.
        float fw = fwidth(q.y);
        float far = smoothstep(0.25, 0.8, fw);
        lit = mix(lit, 0.45, far);
        bump = mix(bump, 0.6, far);
        vec3 shadowC = vec3(0.16, 0.08, 0.16);
        vec3 glowC = mix(sunC, vec3(1.0, 0.6, 0.3), smoothstep(0.0, 0.6, lit));
        glowC = mix(glowC, imgPalette(0.02 + hueP * 0.159) * 1.3, 0.1);
        float strength = (0.7 + 0.7 * swell) * (0.4 + 0.6 * exp(-(p.y - hz) * 1.2));
        col = mix(shadowC, glowC * strength, pow(lit, 0.8));
        // The seams between pouches are darkest.
        col *= 0.55 + 0.45 * smoothstep(0.0, 0.35, bump);
        // Texture of the cloud and softness near the horizon.
        col *= 0.85 + 0.25 * fbm(q * 2.0);
        col = mix(col, vec3(0.9, 0.35, 0.2) * (0.8 + 0.4 * swell), smoothstep(hz + 0.3, hz + 0.06, p.y) * 0.5);
    } else {
        col = vec3(0.0);
    }
    // The clear strip at the horizon where the sun is setting.
    float gap = smoothstep(hz + 0.08, hz + 0.02, p.y) * step(hz, p.y);
    vec3 gapC = mix(vec3(1.0, 0.75, 0.35), vec3(1.0, 0.45, 0.2), smoothstep(hz, hz + 0.07, p.y)) * (1.1 + 0.6 * bass);
    gapC += vec3(1.0, 0.9, 0.6) * exp(-length((p - vec2(-0.25, hz + 0.01)) * vec2(0.6, 3.0)) * 12.0) * (0.8 + 0.5 * bass);
    col = mix(col, gapC, gap);
    // The dark land below with a line of distant trees.
    float land = hz + 0.008 * noise2(vec2(p.x * 30.0, 1.0)) + 0.01 * smoothstep(0.6, 0.9, noise2(vec2(p.x * 80.0, 3.0)));
    if (p.y < land) {
        col = vec3(0.04, 0.025, 0.03) + vec3(0.25, 0.08, 0.03) * exp(-(land - p.y) * 20.0) * 0.4;
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
