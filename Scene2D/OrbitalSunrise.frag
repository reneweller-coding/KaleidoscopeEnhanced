#version 330 core
out vec4 fragColor;
/**
 * @file OrbitalSunrise.frag
 * @brief ORBITAL SUNRISE: the view from low orbit as the sun comes over the
 * limb.  The planet's curve fills the lower frame; its atmosphere is a
 * stack of Rayleigh layers that go from deep blue through gold as the sun
 * climbs; city lights on the night side (round, jittered) fade out with
 * the dawn; clouds from the photo; stars above.  The sun's elevation is
 * the sine of the host's day clock -- it rises AND sets continuously, no
 * wrap ever shows.  The music is the weather and the light; the camera
 * never moves.
 *
 * Audio Reactivity:
 *   dayPhase      -> sun elevation (sin, continuous)
 *   audioValence  -> cloud brightness / weather (light)
 *   audioSwell    -> atmosphere glow (slow)
 *   audioKick     -> city lights twinkle (light)
 *   audioLevel    -> overall
 *   sceneAdvance  -> the planet turns under us (continuous)
 *
 * Per-activation variety: altP (orbit height), hazeP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float dayPhase;
uniform float audioValence;
uniform float audioSwell;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;

uniform float altP;
uniform float hazeP;
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
    for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = p * 2.03 + 3.0; a *= 0.5; }
    return v;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float haze = 0.6 + 0.6 * clamp(hazeP, 0.0, 1.0);
    // The limb: a big circle whose top is the horizon.
    float R = 2.2 + 0.6 * clamp(altP, 0.0, 1.0);
    vec2 pc = vec2(0.0, -R - 0.25);
    float d = length(p - pc) - R;                        // < 0 on the planet
    // Sun elevation from the day clock: rises and sets, never wraps.
    float elev = sin(dayPhase * 6.2831853);              // -1 .. 1
    float dawn = smoothstep(-0.25, 0.35, elev);          // 0 night .. 1 day
    vec2 sunPos = vec2(0.35, -0.25 + 0.55 * elev);

    // Sky colours through the dawn.
    vec3 nightSky = vec3(0.005, 0.008, 0.02);
    vec3 dawnSky  = mix(imgPalette(hue * 0.159 + 0.05), vec3(1.0, 0.55, 0.2), 0.5);
    vec3 daySky   = mix(imgPalette(hue * 0.159 + 0.6), vec3(0.3, 0.55, 1.0), 0.5);

    vec3 col;
    if (d > 0.0)
    {
        // Space above the limb: stars, the sun, and the atmosphere's glow
        // rising above the horizon.
        vec2 su = p * 60.0; vec2 cell = floor(su); vec2 f = fract(su) - 0.5;
        vec2 off = vec2(hash21(cell + 3.1), hash21(cell + 7.7)) - 0.5;
        float star = smoothstep(0.15, 0.02, length(f - off * 0.6)) * step(0.975, hash21(cell));
        col = nightSky + vec3(star) * 0.7 * (1.0 - dawn * 0.8);
        // Sun disc and glare, only when above the limb.
        float sd = length(p - sunPos);
        float sunUp = smoothstep(-0.05, 0.05, elev);
        col += vec3(1.0, 0.97, 0.9) * (exp(-sd * sd * 900.0) * 6.0 + exp(-sd * 3.0) * 0.5) * sunUp;
        // Atmosphere layers above the limb: blue high, gold near the surface,
        // brighter on the sun's side.
        float side = exp(-abs(p.x - sunPos.x) * 1.2);
        vec3 layer = mix(daySky * 0.6, dawnSky * 1.2, exp(-d * 8.0) * (0.5 + 0.5 * side));
        col += layer * exp(-d * 5.0) * haze * (0.15 + 0.85 * dawn + 0.3 * clamp(audioSwell, 0.0, 1.0)) * (0.4 + 0.6 * side + 0.3 * dawn);
    }
    else
    {
        // The planet: surface turning under us, clouds from the photo,
        // city lights on the night side.
        vec2 surf = (p - pc) / R;
        float lon = atan(surf.x, surf.y) + sceneAdvance * 0.03 + sceneTime * 0.005;
        vec2 suv = vec2(lon * 1.2, -d * 2.0);
        float land = fbm(suv * 3.0);
        vec3 ocean = daySky * 0.25;
        vec3 ground = imgPalette(hue * 0.159 + 0.25) * 0.5;
        vec3 surfCol = mix(ocean, ground, smoothstep(0.45, 0.55, land));
        float cl = fbm(suv * 6.0 + vec2(sceneAdvance * 0.01, 0.0));
        float clouds = smoothstep(0.5, 0.75, cl);
        vec3 cloudCol = mix(vec3(0.5), vec3(1.0), clamp(audioValence, 0.0, 1.0));
        surfCol = mix(surfCol, cloudCol, clouds * 0.8);
        // Lit by the sun from its side; the terminator runs across.
        float lit = clamp(dawn * (0.4 + 0.6 * exp(-abs(p.x - sunPos.x) * 0.8)), 0.0, 1.0);
        col = surfCol * (0.03 + 0.9 * lit) * (0.7 + 0.4 * audioLevel);
        // City lights: round jittered points where it is night and land.
        vec2 cu = suv * 40.0; vec2 cell = floor(cu); vec2 f = fract(cu) - 0.5;
        vec2 off = vec2(hash21(cell + 3.1), hash21(cell + 7.7)) - 0.5;
        float city = smoothstep(0.2, 0.04, length(f - off * 0.6)) * step(0.9, hash21(cell)) * smoothstep(0.45, 0.6, land);
        float twinkle = 0.7 + 0.3 * hash21(cell + 5.5) * audioKick;
        col += vec3(1.0, 0.8, 0.5) * city * (1.0 - lit) * (1.0 - clouds) * twinkle * 0.9;
        // Atmosphere seen against the surface near the limb.
        col += dawnSky * exp(d * 10.0) * 0.5 * dawn * haze;
    }

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
