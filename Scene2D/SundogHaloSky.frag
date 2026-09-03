#version 330 core
out vec4 fragColor;
/**
 * @file SundogHaloSky.frag
 * @brief SUNDOG HALO SKY: a low winter sun in a sky full of ice crystals,
 * and the optics they draw -- the 22 degree halo, the two sun dogs on the
 * parhelic circle, the upper tangent arc, a sun pillar.  The crystal load
 * (the treble) is the halo brightness, the sun itself is the swell, the
 * bass warms the low light; the photo is the snowy landscape below and
 * the thin cloud the crystals float in.  Camera fixed.
 *
 * Audio Reactivity:
 *   audioHigh  -> halo and sun-dog brightness (light)
 *   audioSwell -> sun strength (slow)
 *   audioBass  -> low warm light (light)
 *   audioKick  -> a glint on the diamond dust (light)
 *   audioLevel -> brightness
 *
 * Per-activation variety: elevP (sun elevation), dustP, hueP.
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
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float elevP;
uniform float dustP;
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

// A spectral ring: red inside, blue outside, at angular radius r0 (screen units).
vec3 spectralRing(float d, float r0, float w)
{
    float t = (d - r0) / w;                    // -1..1 across the ring
    float inside = smoothstep(-1.2, -0.6, t) * (1.0 - smoothstep(0.6, 1.2, t));
    vec3 c = vec3(smoothstep(0.6, -0.4, t), 1.0 - abs(t) * 1.2, smoothstep(-0.6, 0.4, t));
    return clamp(c, 0.0, 1.0) * inside;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float elev = 0.02 + 0.16 * clamp(elevP, 0.0, 1.0);
    float dust = 0.5 + 0.5 * clamp(dustP, 0.0, 1.0);
    float sun = 0.6 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float horizon = -0.2;
    vec2 sunPos = vec2(0.0, horizon + elev);
    float haloR = 0.38;                          // 22 degrees at this field of view

    // Sky: pale winter, warm near the sun with the bass, thin cloud texture from the photo.
    vec3 sky = mix(vec3(0.75, 0.82, 0.92), vec3(0.45, 0.6, 0.85), smoothstep(horizon, 0.5, p.y));
    float thin = fbm(vec2(p.x * 2.0 + sceneAdvance * 0.02, p.y * 4.0));
    sky = mix(sky, sky * 1.1, thin * 0.3);
    sky = mix(sky, sky * imgPalette(hue * 0.159 + 0.6) * 1.4, 0.12);
    sky += vec3(1.0, 0.7, 0.4) * exp(-length(p - sunPos) * 3.0) * 0.35 * (0.3 + 0.7 * clamp(audioBass, 0.0, 1.0));
    vec3 col = sky;
    // The sun: a warm disc with glare.
    float sd = length(p - sunPos);
    col += vec3(1.0, 0.95, 0.85) * (smoothstep(0.03, 0.025, sd) * 1.6 + exp(-sd * 8.0) * 0.8) * sun;
    // Sun pillar: a vertical streak above and below the sun.
    col += vec3(1.0, 0.85, 0.6) * exp(-abs(p.x - sunPos.x) * 40.0) * exp(-abs(p.y - sunPos.y) * 3.0) * 0.5 * sun * dust;
    // The 22 degree halo: a spectral ring, brighter with the crystal load.
    col += spectralRing(sd, haloR, 0.02) * (0.15 + 0.6 * hi) * dust * sun;
    // Sun dogs: bright spectral spots on the parhelic circle at the halo radius.
    for (int s = -1; s <= 1; s += 2)
    {
        vec2 dogPos = sunPos + vec2(float(s) * haloR * 1.05, 0.0);
        float dd = length((p - dogPos) * vec2(1.0, 2.5));
        vec3 dogCol = vec3(smoothstep(0.06, 0.0, dd) , smoothstep(0.05, 0.0, dd - 0.01), smoothstep(0.05, 0.0, dd - 0.02));
        col += dogCol * (0.4 + 1.0 * hi) * dust * sun;
        // The parhelic circle: a faint white line through the sun dogs.
        col += vec3(1.0) * smoothstep(0.006, 0.0, abs(p.y - sunPos.y)) * smoothstep(haloR * 0.9, haloR * 1.3, abs(p.x - sunPos.x)) * 0.25 * hi * dust;
    }
    // Upper tangent arc: a spectral arc touching the halo at the top, flaring outward.
    float arcD = length((p - sunPos - vec2(0.0, haloR)) * vec2(0.7, 1.8));
    col += spectralRing(arcD, 0.06, 0.02) * step(sunPos.y + haloR * 0.85, p.y) * (0.1 + 0.5 * hi) * dust * sun;
    // Diamond dust: round glints in the air on the kick and the treble.
    vec2 gu = (p + vec2(0.0, -sceneAdvance * 0.05)) * 70.0; vec2 gc = floor(gu); vec2 gf = fract(gu) - 0.5;
    vec2 go = vec2(hash21(gc + 1.3), hash21(gc + 5.9)) - 0.5;
    float glint = smoothstep(0.18, 0.05, length(gf - go * 0.6)) * step(0.95, hash21(gc)) * step(horizon, p.y);
    col += vec3(1.0) * glint * (0.1 + 0.6 * hi + 0.8 * audioKick) * dust;
    // The landscape: the photo as snowfields, blue-shadowed, with a tree line.
    float land = step(p.y, horizon + 0.02 * fbm(vec2(p.x * 4.0, 1.0)));
    vec3 snow = img(vec2(p.x / aspect + 0.5, (p.y + 0.5) * 0.5)) * 0.5 + 0.45;
    snow *= vec3(0.85, 0.9, 1.0) * (0.5 + 0.5 * sun);
    snow += vec3(1.0, 0.8, 0.5) * exp(-length(vec2(p.x - sunPos.x, (p.y - horizon) * 3.0)) * 3.0) * 0.3 * sun;
    col = mix(col, snow, land);
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
