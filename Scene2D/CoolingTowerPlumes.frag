#version 330 core
out vec4 fragColor;
/**
 * @file CoolingTowerPlumes.frag
 * @brief COOLING TOWER PLUMES: three hyperboloid towers against an
 * evening sky, each breathing a steam plume that rises and leans away on
 * the scene clock.  The plumes are lit from below by the plant floodlights
 * and from the side by the last sun, and each carries the colour of a
 * spectrum band, so the sky reads the music.  The swell is how much steam
 * there is, the kick a floodlight sweeping the shell.  The photo is the
 * sky and the concrete.  Camera fixed on the plant fence.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> the plume colours by height (light)
 *   audioSwell        -> plume volume (slow)
 *   sceneAdvance      -> the plumes rise and drift (continuous)
 *   audioKick         -> a floodlight on the shell (light, local)
 *   audioBass         -> the glow inside the towers (slow)
 *
 * Per-activation variety: towersP, windP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSpectrum[32];
uniform float audioSwell;
uniform float audioKick;
uniform float audioBass;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float towersP;
uniform float windP;
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
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; ++i) { v += a * noise2(p); p = p * 2.02 + 5.3; a *= 0.5; } return v; }

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float towers = 2.0 + floor(clamp(towersP, 0.0, 1.0) * 2.0);         // once per activation
    float wind = (clamp(windP, 0.0, 1.0) - 0.5) * 0.7;
    float steam = 0.4 + 0.85 * clamp(audioSwell, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float clock = sceneAdvance * 0.35 + sceneTime * 0.07;
    float ground = -0.34;

    // Evening sky from the photo, deepening upward.
    vec3 sky = img(vec2(uv.x, 0.6 + uv.y * 0.4)) * mix(vec3(0.75, 0.7, 0.85), imgPalette(hue * 0.159 + 0.6), 0.35);
    sky = mix(sky * 1.25, sky * vec3(0.45, 0.42, 0.6), smoothstep(-0.1, 0.5, p.y));
    sky += mix(vec3(1.0, 0.6, 0.35), imgPalette(hue * 0.159 + 0.08), 0.3) * smoothstep(0.2, -0.3, p.y) * 0.35;
    vec3 col = sky;

    // The plumes, drawn behind the shells so a tower's lip cuts its own plume.
    for (int i = 0; i < 4; ++i)
    {
        if (float(i) >= towers) break;
        float fi = float(i);
        float tx = ((fi + 0.5) / towers - 0.5) * aspect * 1.25;
        float th = 0.34 + 0.09 * hash11(fi * 3.7);                        // tower height
        float topY = ground + th;
        // Plume coordinates: height above the lip, and the lean with wind.
        float hgt = (p.y - topY) / 0.9;
        if (hgt > -0.05)
        {
            float lean = (wind + 0.12 * sin(clock * 0.2 + fi)) * hgt * hgt * 2.2;
            float across = (p.x - tx - lean) / (0.075 + 0.5 * hgt);       // widens as it rises
            // The billow: fbm scrolling upward on the clock.
            float n = fbm(vec2(across * 1.6 + fi * 4.0, hgt * 2.4 - clock * 0.6));
            float body = smoothstep(1.3, 0.1, abs(across)) * smoothstep(-0.02, 0.1, hgt)
                       * smoothstep(1.4, 0.5, hgt) * (0.6 + 0.95 * n) * steam * 1.5;
            // Colour by band: the height picks the band, so the plume is a
            // slow vertical spectrogram of the music.
            int band = int(clamp(hgt * 30.0, 0.0, 31.0));
            float e = clamp(audioSpectrum[band] * 1.6, 0.0, 1.0);
            vec3 plumeCol = mix(vec3(0.9, 0.9, 0.95), imgPalette(hue * 0.159 + float(band) / 32.0) * 1.5, 0.35 + 0.4 * e);
            // Lit from below by the floodlights, cooler higher up.
            plumeCol *= 0.8 + 1.0 * exp(-hgt * 1.4) + 0.5 * e;
            col = mix(col, plumeCol, clamp(body, 0.0, 0.94));
        }
    }
    // The towers.
    for (int i = 0; i < 4; ++i)
    {
        if (float(i) >= towers) break;
        float fi = float(i);
        float tx = ((fi + 0.5) / towers - 0.5) * aspect * 1.25;
        float th = 0.34 + 0.09 * hash11(fi * 3.7);
        float topY = ground + th;
        float t = clamp((p.y - ground) / th, 0.0, 1.0);
        // Hyperboloid: waist at about two thirds up.
        float halfW = (0.13 + 0.03 * hash11(fi * 5.1)) * (1.0 - 0.55 * sin(t * 2.1) + 0.28 * t * t);
        float inTower = step(abs(p.x - tx), halfW) * step(ground, p.y) * step(p.y, topY);
        if (inTower > 0.5)
        {
            float across = (p.x - tx) / halfW;
            // Concrete from the photo, shaded round the barrel.
            vec3 shell = img(clamp(vec2(0.2 + fi * 0.2 + across * 0.12, 0.15 + t * 0.5), 0.0, 1.0))
                       * mix(vec3(0.62, 0.6, 0.58), imgPalette(hue * 0.159 + 0.05), 0.25);
            shell *= 0.5 + 0.6 * sqrt(max(1.0 - across * across, 0.0));   // barrel shading
            // Horizontal lift joints and the vertical ribs.
            shell *= 0.85 + 0.15 * smoothstep(0.06, 0.2, abs(fract(t * 26.0) - 0.5));
            shell *= 0.9 + 0.2 * smoothstep(0.1, 0.35, abs(fract(across * 9.0) - 0.5));
            // Weathering streaks down the shell.
            shell *= 0.8 + 0.3 * fbm(vec2(across * 5.0 + fi, t * 3.0));
            // The floodlight: a bright patch low on the shell that the kick lifts.
            float flood = exp(-length(vec2(across * 0.9, (t - 0.18) * 3.0)) * 2.4);
            shell += mix(vec3(1.0, 0.9, 0.7), imgPalette(hue * 0.159 + 0.15), 0.3) * flood * (0.12 + 0.7 * audioKick);
            // The lip and the dark interior just under it.
            shell *= 0.6 + 0.4 * smoothstep(0.98, 0.9, t);
            col = mix(col, shell * (0.6 + 0.4 * (1.0 - t * 0.3)), inTower);
            // The glow inside the throat, on the bass.
            col += mix(vec3(1.0, 0.55, 0.3), imgPalette(hue * 0.159 + 0.1), 0.35)
                 * smoothstep(0.9, 1.0, t) * (0.1 + 0.5 * bass) * (1.0 - abs(across) * 0.6);
        }
    }
    // The plant below: a dark skyline of buildings, stacks and lamps.
    float below = step(p.y, ground + 0.06);
    if (below > 0.5)
    {
        float b = 0.0;
        for (int k = 0; k < 12; ++k)
        {
            float fk = float(k);
            float bx = (fk / 11.0 - 0.5) * aspect * 2.0;
            float bw = 0.04 + 0.05 * hash11(fk * 3.3);
            float bh = 0.02 + 0.06 * hash11(fk * 7.1);
            b = max(b, step(abs(p.x - bx), bw) * step(p.y, ground + bh));
        }
        vec3 plant = mix(vec3(0.05, 0.05, 0.07), imgPalette(hue * 0.159 + 0.5) * 0.12, 0.4);
        col = mix(col, plant, max(b, step(p.y, ground - 0.02)));
        // Sodium lamps along the fence.
        float lamps = smoothstep(0.012, 0.0, abs(fract(p.x * 9.0) - 0.5) - 0.47) * smoothstep(0.04, 0.0, abs(p.y - ground + 0.06));
        col += vec3(1.0, 0.65, 0.3) * lamps * 0.8;
        col += vec3(1.0, 0.65, 0.3) * smoothstep(0.12, 0.0, abs(p.y - ground + 0.06)) * 0.06;
    }
    col *= 0.9 + 0.2 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
