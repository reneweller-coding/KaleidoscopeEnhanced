#version 330 core
out vec4 fragColor;
/**
 * @file TermiteMoundPlumes.frag
 * @brief TERMITE MOUND PLUMES: a cathedral mound on the savanna at dusk,
 * and the heat it breathes out -- plumes of warm air rising from its
 * chimneys that refract the scene behind (the photo, as the dusk sky and
 * the grassland), shimmering.  The plumes rise on the scene clock; the
 * mound's warmth (the bass) is their strength; the treble is the fine
 * shimmer; the swell is the dusk light.  Camera fixed on the savanna.
 *
 * Audio Reactivity:
 *   sceneAdvance -> plumes rising (continuous)
 *   audioBass    -> plume strength / mound warmth (light-sized refraction)
 *   audioHigh    -> fine shimmer (light)
 *   audioSwell   -> dusk light (slow)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: moundP, plumeP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioBass;
uniform float audioHigh;
uniform float audioSwell;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float moundP;
uniform float plumeP;
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
    float moundH = 0.45 + 0.3 * clamp(moundP, 0.0, 1.0);
    float plumeAmt = (0.5 + 0.5 * clamp(plumeP, 0.0, 1.0)) * (0.5 + 0.7 * clamp(audioSwell, 0.0, 1.0));   // slow: the refraction must not follow a fast envelope
    float dusk = 0.5 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float clock = sceneAdvance * 0.5 + sceneTime * 0.1;
    float ground = -0.3;

    // The mound: a spired silhouette from the ground, with chimneys.
    float spire = 0.0;
    vec2 mq = p - vec2(0.05, ground);
    for (int i = 0; i < 5; ++i)
    {
        float fi = float(i);
        float x = (fi - 2.0) * 0.09 + 0.02 * sin(fi * 3.0);
        float h = moundH * (1.0 - 0.18 * abs(fi - 2.0)) + 0.05 * hash21(vec2(fi, 1.0));
        float w = 0.11 - 0.015 * abs(fi - 2.0);
        float tower = step(abs(mq.x - x), w * (1.0 - mq.y / h)) * step(0.0, mq.y) * step(mq.y, h);
        spire = max(spire, tower);
    }
    // Chimney tops: the plume sources.
    // The plumes: a refractive field rising from the spire tops, strongest
    // just above them, fading up; fbm scrolling upward on the clock.
    vec2 pq = vec2(p.x * 3.0, p.y * 2.0 - clock * 1.2);
    float above = smoothstep(ground + moundH * 0.6, ground + moundH * 1.1, p.y) * (1.0 - smoothstep(ground + moundH * 1.1, ground + moundH * 2.2, p.y));
    float lateral = exp(-pow((p.x - 0.05) / 0.28, 2.0));
    float plume = fbm(pq) * above * lateral * plumeAmt;
    vec2 refr = vec2(fbm(pq * 2.0 + 3.0) - 0.5, fbm(pq * 2.0 + 9.0) - 0.5) * plume * 0.09;
    // The scene behind: dusk sky (the photo top) and grassland (the photo bottom), refracted.
    vec2 uv = gl_FragCoord.xy / resolution + refr;
    vec3 sky = img(clamp(vec2(uv.x, 0.55 + uv.y * 0.45), 0.0, 1.0)) * mix(vec3(1.0, 0.7, 0.45), imgPalette(hue * 0.159 + 0.05), 0.35) * dusk;
    sky = mix(sky, vec3(0.25, 0.15, 0.3) * dusk, smoothstep(0.1, 0.5, p.y));
    vec3 grass = img(clamp(vec2(uv.x, uv.y * 0.4), 0.0, 1.0)) * mix(vec3(0.7, 0.55, 0.3), imgPalette(hue * 0.159 + 0.12), 0.3) * dusk * 0.8;
    grass *= 0.8 + 0.2 * sin(p.x * 80.0 + p.y * 30.0);
    vec3 col = mix(sky, grass, step(p.y, ground + 0.01 * fbm(vec2(p.x * 8.0, 1.0))));
    // The mound: dark red earth, lit from the dusk side, warm from within with the bass.
    vec3 earth = mix(vec3(0.6, 0.32, 0.14), imgPalette(hue * 0.159 + 0.08), 0.3) * (0.6 + 0.6 * dusk) * (0.5 + 0.5 * clamp(mq.x + 0.35, 0.0, 1.0));
    earth *= 0.7 + 0.5 * fbm(p * 30.0) * (0.5 + 0.5 * sin(mq.y * 60.0 + fbm(p * 12.0) * 6.0));   // layered mud
    earth += vec3(0.9, 0.4, 0.1) * exp(-mq.y * 3.0) * clamp(audioBass, 0.0, 1.0) * 0.5;
    col = mix(col, earth, spire);
    // The plume made visible: a faint warm haze and the shimmer highlights.
    col += vec3(1.0, 0.7, 0.4) * plume * 0.45 * dusk;
    col += vec3(1.0, 0.9, 0.7) * pow(fbm(pq * 4.0 + 5.0), 6.0) * plume * (0.4 + 0.6 * hi) * 1.2;
    // A sun low at the horizon, and the kick as a distant flash of heat lightning.
    col += vec3(1.0, 0.8, 0.5) * exp(-length((p - vec2(0.55, ground + 0.06)) * vec2(1.0, 2.0)) * 5.0) * dusk * 0.7;
    col += vec3(1.0, 0.9, 0.8) * audioKick * 0.3 * exp(-length(p - vec2(-0.5, 0.25)) * 2.0);
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
