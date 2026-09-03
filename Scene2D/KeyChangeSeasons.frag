#version 330 core
out vec4 fragColor;
/**
 * @file KeyChangeSeasons.frag
 * @brief KEY CHANGE SEASONS: a forest whose season is the key of the
 * music.  The chroma hue (the tonal centre) is the time of year: the
 * foliage colour, the light, the ground (snow, leaf litter, grass) all
 * follow it, and because the hue is a slow, smoothed value the seasons
 * turn as seasons do, over a modulation, never with a beat.  Major/minor
 * (audioMode) is fair or overcast weather.  Round particles -- pollen,
 * falling leaves, snow -- drift on the scene clock, each season its own.
 * The photo is the forest floor and the trunks.  Camera fixed.
 *
 * Audio Reactivity:
 *   audioChromaHue -> season (slow)
 *   audioMode      -> fair / overcast (slow)
 *   sceneAdvance   -> particle drift and light sway (continuous)
 *   audioSwell     -> sunlight (slow)
 *   audioKick      -> light through the canopy (light)
 *   audioLevel     -> brightness
 *
 * Per-activation variety: treesP, mistP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioChromaHue;
uniform float audioMode;
uniform float audioSwell;
uniform float audioKick;
uniform float audioLevel;
uniform float audioValence;

uniform float treesP;
uniform float mistP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
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

    float trees = floor(5.0 + 5.0 * clamp(treesP, 0.0, 1.0));
    float mist = 0.2 + 0.6 * clamp(mistP, 0.0, 1.0);
    // Season from the tonal centre: 0 spring, 0.25 summer, 0.5 autumn, 0.75 winter.
    float season = fract(audioChromaHue / 6.2831853 + hueP * 0.1);
    float spring = max(0.0, 1.0 - abs(season - 0.0) * 4.0) + max(0.0, 1.0 - abs(season - 1.0) * 4.0);
    float summer = max(0.0, 1.0 - abs(season - 0.25) * 4.0);
    float autumn = max(0.0, 1.0 - abs(season - 0.5) * 4.0);
    float winter = max(0.0, 1.0 - abs(season - 0.75) * 4.0);
    float fair = clamp(audioMode, 0.0, 1.0);                 // 1 = major = fair
    float sunlight = (0.4 + 0.6 * clamp(audioSwell, 0.0, 1.0)) * (0.5 + 0.5 * fair);

    // Foliage and ground colours per season.
    vec3 leafCol = spring * vec3(0.55, 0.85, 0.35) + summer * vec3(0.15, 0.5, 0.15) + autumn * vec3(0.9, 0.45, 0.1) + winter * vec3(0.45, 0.5, 0.55);
    vec3 groundCol = spring * vec3(0.4, 0.6, 0.25) + summer * vec3(0.3, 0.5, 0.2) + autumn * vec3(0.6, 0.35, 0.12) + winter * vec3(0.92, 0.94, 1.0);
    vec3 skyCol = mix(vec3(0.55, 0.6, 0.65), vec3(0.6, 0.8, 1.0), fair);
    skyCol = mix(skyCol, vec3(0.95, 0.8, 0.6), autumn * fair * 0.4);

    // Sky and canopy: the canopy is a noise mask of leaves at the top,
    // swaying slowly; light comes through in shafts on the kick.
    float canopy = fbm(vec2(p.x * 3.0 + 0.05 * sin(sceneAdvance * 0.3), p.y * 4.0)) ;
    float leafMask = smoothstep(0.35, 0.6, canopy) * smoothstep(-0.1, 0.35, p.y) * (1.0 - winter * 0.7);
    vec3 col = skyCol * (0.8 + 0.4 * (p.y + 0.5));
    col += vec3(1.0, 0.95, 0.8) * exp(-length(p - vec2(0.3, 0.4)) * 4.0) * sunlight * 0.6;
    col = mix(col, leafCol * (0.5 + 0.7 * sunlight * canopy), leafMask);
    // Trunks: the photo as bark, dark columns.
    for (int i = 0; i < 10; ++i)
    {
        if (float(i) >= trees) break;
        float fi = float(i);
        float x = (hash11(fi * 3.7) - 0.5) * aspect * 1.1;
        float w = 0.02 + 0.03 * hash11(fi * 5.3);
        float dx = abs(p.x - x);
        float trunk = step(dx, w) * step(p.y, 0.45 - 0.2 * hash11(fi * 7.1));
        vec3 bark = img(vec2(fract(fi * 0.13 + dx * 3.0), p.y + 0.5)) * 0.5;
        bark *= 0.5 + 0.5 * (1.0 - dx / w);
        col = mix(col, bark * (0.6 + 0.6 * sunlight), trunk);
    }
    // Ground: the photo as the forest floor tinted by the season.
    float groundLine = -0.2 + 0.03 * fbm(vec2(p.x * 4.0, 2.0));
    float ground = step(p.y, groundLine);
    vec3 floorCol = img(vec2(p.x / aspect + 0.5, (p.y + 0.5) * 0.6)) * groundCol * 1.4;
    floorCol *= 0.6 + 0.6 * sunlight;
    col = mix(col, floorCol, ground);
    // Mist between the trunks, slow.
    float fog = fbm(vec2(p.x * 2.0 - sceneAdvance * 0.05, p.y * 3.0)) * mist * smoothstep(0.3, -0.3, p.y);
    col = mix(col, skyCol * 0.9, clamp(fog, 0.0, 0.7) * (0.5 + 0.5 * (1.0 - fair)));
    // Light shafts through the canopy on the kick (a light effect).
    float shaft = pow(max(fbm(vec2(p.x * 6.0 - p.y * 2.0, 1.0)) - 0.4, 0.0) * 3.0, 2.0) * smoothstep(-0.4, 0.4, p.y);
    col += vec3(1.0, 0.95, 0.8) * shaft * audioKick * sunlight * 0.7;
    // Seasonal particles: round, drifting on the scene clock.
    vec2 drift = vec2(sceneAdvance * 0.15 + 0.05 * sin(sceneAdvance * 0.7), -sceneAdvance * (0.3 + 0.4 * winter + 0.2 * autumn));
    vec2 gu = (p + drift) * 30.0; vec2 cell = floor(gu); vec2 f = fract(gu) - 0.5;
    vec2 off = vec2(hash21(cell + 3.1), hash21(cell + 7.7)) - 0.5;
    float sz = 0.08 + 0.1 * (autumn + winter * 0.5);
    float part = smoothstep(sz, sz * 0.3, length(f - off * 0.6)) * step(0.93, hash21(cell));
    vec3 partCol = spring * vec3(1.0, 0.95, 0.6) + summer * vec3(0.9, 1.0, 0.7) + autumn * vec3(0.95, 0.5, 0.15) + winter * vec3(1.0);
    col += partCol * part * (0.5 + 0.5 * sunlight);
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
