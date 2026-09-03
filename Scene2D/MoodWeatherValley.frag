#version 330 core
out vec4 fragColor;
/**
 * @file MoodWeatherValley.frag
 * @brief MOOD WEATHER VALLEY: a valley of the photo under weather that is
 * the mood of the music.  Arousal is the wind -- the grass and the cloud
 * drift faster, the trees lean (slowly, as a real gust builds); valence is
 * the sun or the rain -- high valence clears the sky and warms the light,
 * low valence brings cloud, rain as round falling drops and a cold cast.
 * Both axes are slow, so the weather changes as weather does.  The kick is
 * distant lightning in the cloud.  Camera fixed on the valley.
 *
 * Audio Reactivity:
 *   audioArousal -> wind speed and lean (slow)
 *   audioValence -> sun vs rain, warmth (slow)
 *   sceneAdvance -> cloud and rain motion (continuous)
 *   audioKick    -> lightning in the cloud (light)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: hillsP, rainP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioArousal;
uniform float audioValence;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;

uniform float hillsP;
uniform float rainP;
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
    float hills = 2.0 + 2.0 * clamp(hillsP, 0.0, 1.0);
    float wind = 0.2 + 1.3 * clamp(audioArousal, 0.0, 1.0);
    float sun = clamp(audioValence, 0.0, 1.0);
    float rainAmt = (1.0 - sun) * (0.5 + 0.5 * clamp(rainP, 0.0, 1.0));
    float windPos = sceneAdvance * wind * 0.3 + sceneTime * 0.05;

    // Sky: clear and warm when the valence is high, overcast when low.
    vec3 clearSky = mix(vec3(0.45, 0.7, 1.0), vec3(1.0, 0.85, 0.6), (0.5 - p.y) * 0.6);
    vec3 cloudCol = mix(vec3(0.35, 0.37, 0.42), imgPalette(hue * 0.159 + 0.6) * 0.5, 0.3);
    float cloud = fbm(vec2(p.x * 1.5 - windPos, p.y * 3.0) + 2.0);
    float cover = smoothstep(0.7 - 0.6 * (1.0 - sun), 0.9 - 0.4 * (1.0 - sun), cloud);
    vec3 sky = mix(clearSky, cloudCol * (0.7 + 0.5 * cloud), cover);
    // The sun: a warm disc when the sky is clear.
    sky += vec3(1.0, 0.9, 0.7) * exp(-length(p - vec2(0.45, 0.3)) * 6.0) * sun * (1.0 - cover * 0.8);
    // Lightning in the cloud on the kick: a diffuse flash, not a cut.
    sky += vec3(0.9, 0.9, 1.0) * cover * audioKick * 0.7 * (1.0 - sun) * fbm(p * 5.0 + sceneAdvance);

    // Hills: layered ridges of the photo, nearer = lower and darker; the
    // trees on them lean with the wind (slow).
    vec3 col = sky;
    for (int i = 0; i < 4; ++i)
    {
        float fi = float(i);
        if (fi >= hills) break;
        float depth = 1.0 - fi / hills;                              // far = 1
        float lean = (0.3 + 0.7 * (1.0 - depth)) * (wind - 0.2) * 0.06;
        float ridge = -0.05 - fi * 0.12 + 0.12 * fbm(vec2((p.x + lean * (p.y + 0.5)) * (1.5 + fi) + fi * 7.0, 1.0)) * depth;
        float m = step(p.y, ridge);
        vec2 huv = vec2(fract(p.x * 0.5 + lean * (p.y + 0.5) + fi * 0.2), clamp((p.y + 0.5) * 0.8, 0.0, 1.0));
        vec3 hill = img(huv) * mix(vec3(0.5), imgPalette(hue * 0.159 + 0.3 + fi * 0.1), 0.4);
        hill *= 0.45 + 0.55 * (1.0 - depth);
        // Warmth with the sun, cold cast in rain.
        hill = mix(hill * vec3(0.8, 0.9, 1.1), hill * vec3(1.15, 1.0, 0.85), sun);
        // Aerial perspective toward the far ridges.
        hill = mix(hill, sky, depth * 0.55);
        // Grass shimmer: the wind runs waves of light across the slope.
        hill *= 0.9 + 0.1 * sin(p.x * 30.0 - windPos * 8.0 + p.y * 10.0) * (wind - 0.2);
        col = mix(col, hill, m);
    }
    // Rain: round drops streaked by the wind, falling on the scene clock.
    if (rainAmt > 0.02)
    {
        vec2 rp = vec2(p.x + p.y * 0.25 * (wind - 0.2), p.y + sceneAdvance * 1.5 + sceneTime * 0.3);
        vec2 gu = rp * vec2(60.0, 14.0); vec2 cell = floor(gu); vec2 f = fract(gu) - 0.5;
        vec2 off = vec2(hash21(cell + 3.1), hash21(cell + 7.7)) - 0.5;
        vec2 d = (f - off * 0.6) * vec2(1.0, 0.25);
        float drops = smoothstep(0.2, 0.05, length(d)) * step(1.0 - rainAmt * 0.6, hash21(cell));
        col = mix(col, vec3(0.75, 0.8, 0.9), drops * 0.6);
        col *= 1.0 - 0.15 * rainAmt;
    }
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
