#version 330 core
out vec4 fragColor;
/**
 * @file TitanMethaneRain.frag
 * @brief TITAN METHANE RAIN: the shore of a hydrocarbon lake on Titan
 * under the orange haze.  Methane rain -- round drops falling slowly in
 * the low gravity -- pocks the black lake with rings; Saturn hangs pale
 * and huge behind the haze; the dunes of the far shore are the photo.
 * The rain strength follows the swell, the haze glows with distant
 * lightning in the bass, the drops catch the light on the treble.  Camera
 * fixed on the shore.
 *
 * Audio Reactivity:
 *   audioSwell   -> rain amount (slow)
 *   sceneAdvance -> rain fall and lake ripples (continuous)
 *   audioBass    -> haze lightning glow (light)
 *   audioHigh    -> drop glints (light)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: hazeP, lakeP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioBass;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float hazeP;
uniform float lakeP;
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
    float haze = 0.5 + 0.5 * clamp(hazeP, 0.0, 1.0);
    float lakeY = -0.15 - 0.1 * clamp(lakeP, 0.0, 1.0);
    float rain = 0.3 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    float clock = sceneAdvance * 0.6 + sceneTime * 0.12;

    // Orange haze sky, darker up, warmer at the horizon; lightning glow.
    vec3 hazeCol = mix(vec3(0.85, 0.5, 0.15), imgPalette(hue * 0.159 + 0.05), 0.25);
    vec3 sky = mix(hazeCol * 1.1, vec3(0.35, 0.18, 0.05), smoothstep(-0.1, 0.5, p.y));
    sky += hazeCol * 0.5 * clamp(audioBass, 0.0, 1.0) * fbm(vec2(p.x * 2.0 + clock * 0.1, p.y * 3.0));
    // Saturn: a pale disc with rings, low behind the haze.
    vec2 sp = p - vec2(0.35, 0.28);
    float sr = length(sp);
    float saturn = smoothstep(0.13, 0.125, sr);
    float ringR = length(vec2(sp.x, sp.y * 4.5));
    float rings = smoothstep(0.02, 0.0, abs(ringR - 0.26) - 0.06) * step(0.13, sr + step(sp.y, 0.0) * 0.2);
    vec3 satCol = mix(vec3(0.95, 0.85, 0.65), hazeCol, 0.5);
    sky = mix(sky, satCol * (0.6 + 0.3 * sqrt(max(1.0 - sr * sr / 0.017, 0.0))), saturn * (1.0 - haze * 0.5));
    sky = mix(sky, satCol * 0.8, rings * (1.0 - haze * 0.5) * 0.6);
    // Far dunes: the photo as the hydrocarbon dune field, hazed.
    float duneLine = 0.02 + 0.05 * fbm(vec2(p.x * 3.0, 1.0));
    vec3 dunes = img(vec2(p.x / aspect + 0.5, (p.y + 0.2) * 0.8)) * mix(vec3(0.6, 0.4, 0.2), imgPalette(hue * 0.159 + 0.1), 0.3) * 0.9;
    dunes = mix(dunes, hazeCol * 0.7, haze * 0.5);
    vec3 col = mix(sky, dunes, step(p.y, duneLine));
    // The lake: black, mirroring the haze, with rain rings and ripples.
    if (p.y < lakeY)
    {
        vec2 lq = vec2(p.x, (lakeY - p.y) * 4.0);
        vec3 lake = vec3(0.02, 0.015, 0.01) + hazeCol * 0.12 * exp(-(lakeY - p.y) * 3.0);
        // Rain rings: expanding circles at hashed spots on the clock.
        float ringsL = 0.0;
        for (int k = 0; k < 8; ++k)
        {
            float fk = float(k);
            float ph = fract(clock * (0.5 + 0.3 * hash21(vec2(fk, 1.0))) + hash21(vec2(fk, 2.0)));
            vec2 c = vec2((hash21(vec2(fk, 3.0)) - 0.5) * aspect, lakeY - hash21(vec2(fk, 4.0)) * 0.3);
            float rr = length((p - c) * vec2(1.0, 4.0));
            ringsL += exp(-abs(rr - ph * 0.25) * 60.0) * (1.0 - ph) * rain;
        }
        lake += hazeCol * ringsL * 0.35;
        // Wind ripples.
        lake += hazeCol * 0.05 * pow(0.5 + 0.5 * sin(p.x * 40.0 + clock * 2.0 + lq.y * 6.0), 4.0);
        col = lake;
    }
    // Rain: round drops falling slowly, glinting on the treble.
    vec2 rp = vec2(p.x + 0.05 * sin(clock * 0.3), p.y + clock * 0.5);
    vec2 gu = rp * vec2(40.0, 24.0); vec2 cell = floor(gu); vec2 f = fract(gu) - 0.5;
    vec2 off = vec2(hash21(cell + 3.1), hash21(cell + 7.7)) - 0.5;
    vec2 d = (f - off * 0.6) * vec2(1.0, 0.7);
    float drops = smoothstep(0.16, 0.05, length(d)) * step(1.0 - rain * 0.5, hash21(cell));
    col = mix(col, hazeCol * 1.3 + 0.2, drops * (0.4 + 0.6 * clamp(audioHigh * 2.0, 0.0, 1.0)));
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
