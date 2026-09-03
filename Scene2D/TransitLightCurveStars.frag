#version 330 core
out vec4 fragColor;
/**
 * @file TransitLightCurveStars.frag
 * @brief TRANSIT LIGHT CURVE STARS: the exoplanet transit method as a sky.
 * A field of stars; each hosts a planet on its own period, and when the
 * planet crosses the star the star dims by the transit depth (a light
 * event: nothing moves but brightness).  Below the sky, three light curves
 * scroll steadily -- the brightness histories of three host stars picked
 * by the tonal centre -- showing the characteristic flat-bottomed dips.
 * The photo is the star colours and the nebulosity behind.  Camera still.
 *
 * Audio Reactivity:
 *   sceneAdvance   -> orbital phases and curve scroll (continuous)
 *   audioChromaHue -> which stars are the three featured hosts (slow)
 *   audioKick      -> twinkle (light)
 *   audioSwell     -> nebula glow (slow)
 *   audioLevel     -> brightness
 *
 * Per-activation variety: countP, depthP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float countP;
uniform float depthP;
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

// Transit shape: 1 inside the transit (with limb-darkened ingress/egress).
float transit(float phase, float halfW)
{
    float d = abs(fract(phase) - 0.5);
    return smoothstep(halfW, halfW * 0.6, d);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    int nStars = 18 + int(clamp(countP, 0.0, 1.0) * 14.0);
    float depth = 0.25 + 0.45 * clamp(depthP, 0.0, 1.0);
    float clock = sceneAdvance * 0.25 + sceneTime * 0.05;
    float skyTop = 0.5, skyBot = -0.2;                      // the sky above y = skyBot

    // Nebulosity: the photo soft and dim behind the stars.
    vec2 nuv = vec2(p.x / aspect + 0.5, (p.y - skyBot) / (skyTop - skyBot));
    vec3 col = (interpolation * textureLod(tex0, nuv, 3.0) + (1.0 - interpolation) * textureLod(tex1, nuv, 3.0)).rgb;
    col *= imgPalette(hue * 0.159 + 0.6) * (0.35 + 0.5 * clamp(audioSwell, 0.0, 1.0));
    col *= step(skyBot, p.y);
    // Faint round background stars.
    vec2 su = p * 90.0; vec2 sc = floor(su); vec2 sf = fract(su) - 0.5;
    vec2 so = vec2(hash21(sc + 1.3), hash21(sc + 5.9)) - 0.5;
    col += vec3(0.7) * smoothstep(0.14, 0.03, length(sf - so * 0.6)) * step(0.985, hash21(sc)) * step(skyBot, p.y);

    // The three featured hosts: indices from the tonal centre (slow).
    float sel = audioChromaHue / 6.2831853;
    int host0 = int(mod(floor(sel * float(nStars)), float(nStars)));
    int host1 = int(mod(float(host0) + 7.0, float(nStars)));
    int host2 = int(mod(float(host0) + 13.0, float(nStars)));
    float curves[3];
    curves[0] = 1.0; curves[1] = 1.0; curves[2] = 1.0;

    for (int i = 0; i < 32; ++i)
    {
        if (i >= nStars) break;
        float fi = float(i);
        vec2 sp = vec2((hash11(fi * 3.1) - 0.5) * aspect * 0.95, skyBot + 0.06 + hash11(fi * 5.7) * (skyTop - skyBot - 0.1));
        float period = 0.35 + 1.4 * hash11(fi * 7.3);
        float phase = clock / period + hash11(fi * 9.1);
        float halfW = 0.03 + 0.03 * hash11(fi * 11.3);
        float dip = transit(phase, halfW) * depth * (0.6 + 0.4 * hash11(fi * 2.3));
        float bright = 1.0 - dip;
        float sz = 0.008 + 0.012 * hash11(fi * 4.9);
        bool featured = (i == host0 || i == host1 || i == host2);
        if (featured) sz *= 1.6;
        float d = length(p - sp);
        vec3 sc3 = mix(vec3(1.0, 0.95, 0.85), imgPalette(hue * 0.159 + hash11(fi * 6.1)), 0.5) * 1.6;
        float disc = smoothstep(sz, sz * 0.5, d);
        float glow = exp(-d / (sz * 4.0)) * 0.6;
        float twinkle = 1.0 + 0.35 * audioKick * hash11(fi * 8.8);
        col += sc3 * (disc + glow) * bright * twinkle;
        // The transiting planet as a dark round dot crossing the disc.
        float px = (fract(phase) - 0.5) / halfW * sz * 1.3;
        float planet = smoothstep(sz * 0.32, sz * 0.2, length(p - sp - vec2(px, sz * 0.15))) * step(abs(px), sz * 1.2);
        col = mix(col, col * 0.15, planet * step(0.0, bright));
        if (featured)
        {
            int slot = (i == host0) ? 0 : ((i == host1) ? 1 : 2);
            // The curve: brightness as a function of time offset along x.
            float x = (p.x / aspect + 0.5);                      // 0..1 across
            float tOff = (x - 0.85) * 1.4;                       // right edge = now
            float ph = (clock + tOff) / period + hash11(fi * 9.1);
            float c = 1.0 - transit(ph, halfW) * depth * (0.6 + 0.4 * hash11(fi * 2.3));
            curves[slot] = c;
        }
    }
    // Light-curve panel below the sky: three traces, each in its host's tint.
    if (p.y < skyBot)
    {
        vec3 panel = vec3(0.02, 0.025, 0.04) + imgPalette(hue * 0.159 + 0.6) * 0.03;
        // Grid lines.
        float grid = smoothstep(0.003, 0.0, abs(fract((p.y - skyBot) * 12.0) - 0.5) - 0.48) * 0.15;
        panel += vec3(grid);
        for (int s = 0; s < 3; ++s)
        {
            float base = skyBot - 0.09 - float(s) * 0.11;
            float yv = base + (curves[s] - 1.0) * 0.16 + 0.04;
            float line = smoothstep(0.006, 0.001, abs(p.y - yv));
            vec3 tc = imgPalette(hue * 0.159 + float(s) * 0.33 + 0.1) * 1.4 + 0.3;
            panel += tc * line;
            // The "now" marker.
            panel += tc * smoothstep(0.004, 0.0, abs(p.x / aspect + 0.5 - 0.85)) * 0.3;
        }
        col = panel;
    }
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
