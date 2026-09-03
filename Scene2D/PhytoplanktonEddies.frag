#version 330 core
out vec4 fragColor;
/**
 * @file PhytoplanktonEddies.frag
 * @brief PHYTOPLANKTON EDDIES: the ocean from orbit -- a spring bloom of
 * plankton drawn out into the swirls of mesoscale eddies.  The photo is
 * the ocean colour; the bloom is advected by a field of slowly turning
 * vortices on the scene clock (Lamb-Oseen cores, incompressible), so the
 * green filaments wind ever finer; the bloom strength is the swell, the
 * treble is sun glitter on the sea, the bass deepens the blue.  Camera
 * fixed high above.
 *
 * Audio Reactivity:
 *   sceneAdvance -> the eddy field and advection (continuous)
 *   audioSwell   -> bloom strength (slow)
 *   audioHigh    -> sun glitter (light)
 *   audioBass    -> water depth colour (colour)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: eddiesP, windP, hueP.
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
uniform float audioHigh;
uniform float audioBass;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float eddiesP;
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

// Velocity of the eddy field at q (Lamb-Oseen vortices drifting slowly).
vec2 eddyVel(vec2 q, float clock, int n)
{
    vec2 v = vec2(0.0);
    for (int i = 0; i < 7; ++i)
    {
        if (i >= n) break;
        float fi = float(i);
        vec2 c = vec2((hash11(fi * 3.7) - 0.5) * 1.8, (hash11(fi * 5.3) - 0.5) * 1.1) + 0.08 * vec2(sin(clock * 0.2 + fi), cos(clock * 0.17 + fi * 2.0));
        float gamma = (hash11(fi * 7.1) > 0.5 ? 1.0 : -1.0) * (0.15 + 0.15 * hash11(fi * 9.9));
        float rc = 0.15 + 0.15 * hash11(fi * 2.3);
        vec2 d = q - c; float r2 = dot(d, d);
        float vt = gamma * (1.0 - exp(-r2 / (rc * rc))) / max(sqrt(r2), 1e-3);
        v += vec2(-d.y, d.x) / max(sqrt(r2), 1e-3) * vt;
    }
    return v;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    int nEddies = 3 + int(clamp(eddiesP, 0.0, 1.0) * 4.0);
    float wind = 0.3 + 0.7 * clamp(windP, 0.0, 1.0);
    float clock = sceneAdvance * 0.4 + sceneTime * 0.08;
    float bloomAmt = 0.3 + 0.8 * clamp(audioSwell, 0.0, 1.0);

    // Advect backward through the eddy field to find where this water came
    // from; the bloom pattern lives in that source coordinate.
    vec2 q = p;
    for (int s = 0; s < 12; ++s)
    {
        q -= eddyVel(q, clock, nEddies) * 0.12 * wind;
    }
    q -= vec2(clock * 0.03 * wind, 0.0);
    // Bloom: filaments of fbm in the source frame, threshold by the swell.
    float bloom = fbm(q * 3.0 + 7.0) * 0.7 + fbm(q * 9.0) * 0.3;
    bloom = smoothstep(0.55 - 0.2 * bloomAmt, 0.75, bloom) * bloomAmt;
    // Ocean colour: the photo as the sea surface (deep blue with the bass),
    // the bloom as milky green-turquoise.
    vec3 sea = img(fract(q * 0.4 + 0.5)) * mix(vec3(0.05, 0.2, 0.4), imgPalette(hue * 0.159 + 0.6), 0.4) * 1.5;
    sea = mix(sea, vec3(0.02, 0.08, 0.25), clamp(audioBass, 0.0, 1.0) * 0.4);
    vec3 bloomCol = mix(vec3(0.3, 0.8, 0.6), imgPalette(hue * 0.159 + 0.3), 0.35) * 1.2;
    vec3 col = mix(sea, bloomCol, bloom);
    // Cloud shadows and sun glitter (round sparkles) on the treble.
    float cloud = smoothstep(0.55, 0.75, fbm(p * 1.5 - clock * 0.05 + 3.0));
    col *= 1.0 - 0.35 * cloud;
    vec2 gu = p * 120.0; vec2 gc = floor(gu); vec2 gf = fract(gu) - 0.5;
    vec2 go = vec2(hash21(gc + 1.3), hash21(gc + 5.9)) - 0.5;
    float glitter = smoothstep(0.2, 0.05, length(gf - go * 0.6)) * step(0.97, hash21(gc)) * (1.0 - cloud);
    col += vec3(1.0, 0.98, 0.9) * glitter * (0.1 + 0.9 * clamp(audioHigh * 2.0, 0.0, 1.0)) * smoothstep(0.6, 0.0, length(p - vec2(0.3, 0.2)));
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
