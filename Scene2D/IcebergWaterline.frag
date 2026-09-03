#version 330 core
out vec4 fragColor;
/**
 * @file IcebergWaterline.frag
 * @brief ICEBERG WATERLINE: the split view -- the iceberg white above the
 * surface, and below it the nine tenths, vast and blue, the photo
 * refracted through the ice.  Light rays fall through the water on the
 * swell, bubbles (round) rise on the scene clock, small fish pass as
 * round-bodied shadows, and the kick is a crack of light in the ice.
 * Camera fixed at the waterline.
 *
 * Audio Reactivity:
 *   audioSwell   -> sunlight and rays (slow)
 *   sceneAdvance -> bubbles, fish, water motion (continuous)
 *   audioKick    -> crack light in the ice (light)
 *   audioBass    -> deep-water glow (light)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: massP (underwater size), tiltP, hueP.
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
uniform float audioKick;
uniform float audioBass;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float massP;
uniform float tiltP;
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
    float mass = 0.7 + 0.5 * clamp(massP, 0.0, 1.0);
    float tilt = (clamp(tiltP, 0.0, 1.0) - 0.5) * 0.3;
    float sun = 0.6 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    float clock = sceneAdvance * 0.3 + sceneTime * 0.06;
    float waterline = 0.12;

    // The berg outline: above the line a small jagged peak, below a huge
    // rounded mass; both from a radial profile with noise.
    vec2 c = vec2(0.05 + tilt * 0.3, waterline);
    float above = 0.0, below = 0.0;
    {
        vec2 q = p - c;
        float ang = atan(q.y, q.x);
        float rAbove = 0.22 * (1.0 + 0.5 * fbm(vec2(ang * 2.0, 1.0))) * smoothstep(-0.2, 0.4, q.y);
        float rBelow = 0.85 * mass * (1.0 + 0.25 * fbm(vec2(ang * 1.5 + 3.0, 2.0)));
        float r = length(q * vec2(1.0, 1.0 + 0.3 * step(q.y, 0.0)));
        above = step(waterline, p.y) * step(r, rAbove) * step(abs(q.x + q.y * tilt), 0.3);
        below = step(p.y, waterline) * step(r, rBelow) * step(abs(q.x - q.y * tilt), 0.7 * mass);
    }
    vec3 col;
    if (p.y >= waterline)
    {
        // Sky: pale polar sky from the photo, the sea surface glittering.
        vec3 sky = img(vec2(p.x / aspect + 0.5, 0.6 + p.y * 0.5)) * mix(vec3(0.8, 0.9, 1.0), imgPalette(hue * 0.159 + 0.6), 0.25) * sun;
        col = sky;
        vec3 ice = vec3(0.92, 0.96, 1.0) * (0.6 + 0.5 * sun);
        float shade = 0.7 + 0.3 * fbm(p * 12.0);
        col = mix(col, ice * shade, above);
        // The waterline glitter.
        col += vec3(1.0) * smoothstep(0.01, 0.0, abs(p.y - waterline)) * 0.4 * sun;
    }
    else
    {
        // Underwater: blue deepening with depth, rays from above, the berg
        // as the photo refracted in the ice, bubbles and fish.
        float d = waterline - p.y;
        vec3 water = mix(vec3(0.15, 0.45, 0.7), vec3(0.01, 0.06, 0.18), smoothstep(0.0, 0.7, d));
        water += imgPalette(hue * 0.159 + 0.55) * 0.15 * clamp(audioBass, 0.0, 1.0) * smoothstep(0.2, 0.7, d);
        float rays = pow(0.5 + 0.5 * sin(p.x * 25.0 + d * 8.0 + clock * 0.5), 8.0) * exp(-d * 3.0) * sun;
        water += vec3(0.4, 0.7, 0.9) * rays * 0.4;
        col = water;
        // The berg below: the photo seen through blue ice, refracted by noise.
        vec2 ruv = vec2(p.x / aspect + 0.5, (p.y + 0.5) * 0.8) + 0.03 * vec2(fbm(p * 6.0 + clock * 0.3), fbm(p * 6.0 + 9.0));
        vec3 bergIce = img(clamp(ruv, 0.0, 1.0)) * vec3(0.55, 0.8, 1.0) * 1.2;
        bergIce = mix(bergIce, vec3(0.5, 0.75, 0.95), 0.35) * (0.4 + 0.6 * exp(-d * 1.5)) * (0.6 + 0.5 * sun);
        // Cracks: bright lines lit on the kick.
        float crack = smoothstep(0.55, 0.62, fbm(p * 9.0)) * (1.0 - smoothstep(0.62, 0.7, fbm(p * 9.0)));
        bergIce += vec3(0.8, 0.95, 1.0) * crack * (0.15 + 1.2 * audioKick);
        col = mix(col, bergIce, below);
        // Bubbles rising (round), fish (round-bodied dark shapes) passing.
        vec2 bu = (p + vec2(0.0, -clock * 0.5)) * 30.0; vec2 bc = floor(bu); vec2 bf = fract(bu) - 0.5;
        vec2 bo = vec2(hash21(bc + 1.3), hash21(bc + 5.9)) - 0.5;
        float bubble = smoothstep(0.16, 0.08, length(bf - bo * 0.6)) * step(0.95, hash21(bc)) * (1.0 - below);
        col += vec3(0.6, 0.8, 0.9) * bubble * 0.6;
        for (int k = 0; k < 6; ++k)
        {
            float fk = float(k);
            vec2 fp = vec2((fract(clock * (0.05 + 0.04 * hash11(fk * 3.1)) + hash11(fk * 5.3)) - 0.5) * aspect * 1.2, waterline - 0.15 - 0.5 * hash11(fk * 7.7));
            float fish = smoothstep(0.02, 0.012, length((p - fp) * vec2(0.6, 1.0)));
            col = mix(col, vec3(0.02, 0.05, 0.1), fish * (1.0 - below));
        }
    }
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
