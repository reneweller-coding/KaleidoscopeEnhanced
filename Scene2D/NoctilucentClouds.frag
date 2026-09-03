#version 330 core
out vec4 fragColor;
/**
 * @file NoctilucentClouds.frag
 * @brief NOCTILUCENT CLOUDS: the highest clouds there are, lit by a sun
 * already far below the horizon -- electric blue-white sheets rippled by
 * gravity waves, drifting slowly over a landscape in full night.  The
 * ripples run on the scene clock, their fine structure is the treble, the
 * twilight glow at the horizon is the swell, the bass is the deep
 * afterglow; the photo is the dark land and the far water.  Camera fixed.
 *
 * Audio Reactivity:
 *   sceneAdvance -> ripple drift (continuous)
 *   audioHigh    -> fine ripple detail (light)
 *   audioSwell   -> twilight strength (slow)
 *   audioBass    -> horizon afterglow (light)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: sheetsP, rippleP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioHigh;
uniform float audioSwell;
uniform float audioBass;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float sheetsP;
uniform float rippleP;
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
    for (int i = 0; i < 5; ++i) { v += a * noise2(p); p = p * 2.03 + 5.0; a *= 0.5; }
    return v;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    int sheets = 2 + int(clamp(sheetsP, 0.0, 1.0) * 2.0);
    float rippleF = 6.0 + 8.0 * clamp(rippleP, 0.0, 1.0);
    float twilight = 0.7 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float clock = sceneAdvance * 0.25 + sceneTime * 0.05;
    float horizon = -0.12;

    // Night sky: deep blue up, the twilight band orange-to-teal at the horizon.
    vec3 sky = mix(vec3(0.02, 0.03, 0.08), vec3(0.0, 0.01, 0.03), smoothstep(horizon, 0.5, p.y));
    vec3 glow = mix(vec3(0.9, 0.5, 0.2), vec3(0.2, 0.6, 0.7), smoothstep(0.0, 0.25, p.y - horizon));
    sky += glow * exp(-(p.y - horizon) * 6.0) * step(horizon, p.y) * twilight * (0.5 + 0.5 * clamp(audioBass, 0.0, 1.0));
    // Round stars.
    vec2 su = p * 90.0; vec2 sc = floor(su); vec2 sf = fract(su) - 0.5;
    vec2 so = vec2(hash21(sc + 1.3), hash21(sc + 5.9)) - 0.5;
    sky += vec3(0.7) * smoothstep(0.14, 0.03, length(sf - so * 0.6)) * step(0.985, hash21(sc)) * smoothstep(horizon, 0.3, p.y);
    vec3 col = sky;

    // The cloud sheets: each a thin layer in perspective (higher = farther),
    // rippled by gravity waves (bands) and finer billows; lit blue-white
    // from below by the sunk sun -- brightest low, fading up.
    vec3 nlc = mix(vec3(0.6, 0.8, 1.0), imgPalette(hue * 0.159 + 0.6), 0.25);
    for (int s = 0; s < 4; ++s)
    {
        if (s >= sheets) break;
        float fs = float(s);
        float band = horizon + 0.08 + fs * 0.09;                         // the sheet's screen band
        float persp = 1.0 / max(p.y - horizon + 0.05, 0.05);               // perspective compression upward
        vec2 cq = vec2(p.x * persp * 0.6 + clock * (0.2 + 0.1 * fs) + fs * 11.0, persp * 0.8);
        float waves = 0.5 + 0.5 * sin(cq.y * rippleF + fbm(cq * 1.5) * 4.0 - clock * 0.5);
        float billows = fbm(cq * 3.0 + fs * 3.0) * 0.6 + fbm(cq * 9.0 + 5.0) * 0.4 * (0.5 + 0.5 * hi);
        float density = smoothstep(0.35, 0.75, billows * 0.7 + waves * 0.4);
        float extent = smoothstep(band - 0.06, band + 0.02, p.y) * (1.0 - smoothstep(band + 0.12, band + 0.3, p.y));
        float lit = exp(-(p.y - horizon) * 2.5) * twilight;
        col += nlc * density * extent * lit * (0.7 + 0.3 * hi) * 1.9;
    }
    // The land: the photo as the dark landscape, a lake mirroring the sky.
    float land = step(p.y, horizon);
    vec3 ground = img(vec2(p.x / aspect + 0.5, (p.y + 0.5) * 0.4)) * 0.08 * imgPalette(hue * 0.159 + 0.55);
    ground += glow * exp(-(horizon - p.y) * 5.0) * 0.2 * twilight;    // the lake mirroring the twilight
    col = mix(col, ground, land);
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
