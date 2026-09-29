#version 330 core
out vec4 fragColor;
/**
 * @file GrandPrismaticAerial.frag
 * @brief GRAND PRISMATIC AERIAL: a great hot spring seen from high above -- a
 * pool of impossible deep blue in the middle, ringed by turquoise, then
 * bands of green, yellow, orange and rust where the heat-loving microbes
 * grow, their mats running out from the rim in fine radial fingers across
 * the pale sinter terraces.  A thin boardwalk crosses the white crust.
 * Steam rises off the hot water and drifts across in slow veils.  The
 * camera hangs still; the steam and the shimmer move.
 *
 * Audio Reactivity:
 *   audioSwell  -> the steam (slow)
 *   audioHigh   -> the glitter of the sun on the pool (light)
 *   audioBass   -> the glow of the deep blue (light)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> steam drifting, the water's shimmer
 *
 * Per-activation variety: ringsP (how wide the colour bands), hueP.
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
uniform float audioHigh;
uniform float audioBass;
uniform float audioLevel;
uniform float audioValence;
uniform float audioChromaHue;

uniform float ringsP;
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
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;
    float bandW = 0.8 + 0.5 * clamp(ringsP, 0.0, 1.0);

    // The spring's centre, a little off the middle; its outline wobbles.
    vec2 c = p - vec2(-0.08, 0.02);
    float ang = atan(c.y, c.x);
    float r = length(c * vec2(1.0, 1.12));
    float wob = 0.035 * (fbm(vec2(ang * 1.5, 1.0)) - 0.5) + 0.02 * sin(ang * 3.0 + 1.0);
    float rr = r + wob;                                         // the distorted radius
    // Radial fingers of microbial mat running out from the rim.
    float fingers = fbm(vec2(ang * 18.0, r * 3.0)) * 0.7 + 0.3 * noise2(vec2(ang * 60.0, r * 10.0));
    float reach = rr - 0.06 * fingers * smoothstep(0.2, 0.34, rr);

    // The bands, from the deep blue centre outward.
    float s = reach / bandW;
    vec3 deep = vec3(0.0, 0.12, 0.42) * (0.9 + 0.4 * bass);
    vec3 turq = vec3(0.1, 0.62, 0.72);
    vec3 green = vec3(0.45, 0.62, 0.2);
    vec3 yell = vec3(0.92, 0.75, 0.2);
    vec3 orng = vec3(0.9, 0.42, 0.1);
    vec3 rust = vec3(0.55, 0.22, 0.1);
    vec3 sinter = vec3(0.95, 0.92, 0.84);
    vec3 col = deep;
    col = mix(col, turq, smoothstep(0.08, 0.15, s));
    col = mix(col, green, smoothstep(0.17, 0.19, s));
    col = mix(col, yell, smoothstep(0.19, 0.215, s));
    col = mix(col, orng, smoothstep(0.23, 0.26, s));
    col = mix(col, rust, smoothstep(0.29, 0.33, s));
    // The microbe mats dissolve into the white crust in streaks.
    float mat = smoothstep(0.42, 0.3, s + 0.08 * (fingers - 0.5));
    col = mix(sinter * (0.93 + 0.07 * noise2(p * 200.0)) * (0.95 + 0.08 * fbm(p * 6.0)), col, mat);
    // Orange runoff channels trailing away over the crust.
    float run = smoothstep(0.62, 0.72, fbm(vec2(ang * 5.0 + 3.0, r * 1.5)) + 0.1 * (noise2(vec2(ang * 80.0, r * 6.0)) - 0.5)) * smoothstep(0.3, 0.5, s) * smoothstep(1.2, 0.5, s);
    col = mix(col, mix(orng, rust, 0.5), run * 0.6);
    // Terraces: faint ridges on the crust.
    col *= 1.0 - 0.05 * (1.0 - mat) * smoothstep(0.55, 0.75, noise2(p * 90.0));
    col = mix(col, col * imgPalette(0.1 + hueP * 0.159) * 1.5, 0.08);

    // The pool's water: depth gradient and the sun's glitter on ripples.
    float water = 1.0 - smoothstep(0.14, 0.2, s);
    float depthC = smoothstep(0.15, 0.0, s);
    col = mix(col, col * vec3(0.7, 0.85, 1.1), depthC * 0.5);
    {
        vec2 g = p * 110.0 + vec2(T * 0.2, T * 0.13), gi = floor(g), gf = fract(g);
        vec2 gc = 0.25 + 0.5 * vec2(hash21(gi), hash21(gi + 3.0));
        float tw = pow(0.5 + 0.5 * sin(T * 2.3 + hash21(gi + 7.0) * 40.0), 4.0);
        col += vec3(1.0, 0.98, 0.9) * smoothstep(0.12, 0.0, length(gf - gc)) * step(0.9, hash21(gi + 5.0)) * tw * water * (0.2 + 1.0 * hi);
    }

    // A boardwalk crossing the crust, with its shadow.
    {
        float bx = p.y - (-0.34 + 0.18 * p.x + 0.04 * sin(p.x * 3.0));
        float bw = smoothstep(0.006, 0.004, abs(bx)) * step(0.28, s);
        col = mix(col, col * 0.6, smoothstep(0.012, 0.006, abs(bx + 0.006)) * step(0.28, s));
        col = mix(col, vec3(0.45, 0.35, 0.25), bw);
    }

    // Steam: veils rising off the hot water and drifting downwind.
    vec2 sq = p * 2.2 + vec2(-T * 0.05, T * 0.012);
    float steam = fbm(sq + 0.8 * vec2(fbm(sq * 0.8 + T * 0.01), fbm(sq * 0.8 + 3.0)));
    float src = exp(-max(rr - 0.12, 0.0) * 3.0) * smoothstep(-0.6, 0.3, c.x + 0.3);
    float veil = smoothstep(0.5, 0.85, steam) * (0.08 + 0.92 * src) * (0.4 + 0.6 * swell);
    col = mix(col, vec3(0.95, 0.96, 0.98), clamp(veil, 0.0, 0.85));

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
